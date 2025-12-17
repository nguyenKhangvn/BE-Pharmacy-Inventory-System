import { Alert } from "../models/index.js";
import cronJobs from "../jobs/cronJobs.js";

/**
 * Controller xử lý alerts
 */
export const alertController = {
  /**
   * Lấy danh sách alerts với filters và pagination
   * GET /api/alerts
   */
  async getAlerts(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        alertType,
        severity,
        status = "ACTIVE",
        productId,
        warehouseId,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Build filter
      const filter = {};
      if (alertType) filter.alertType = alertType;
      if (severity) filter.severity = severity;
      if (status) filter.status = status;
      if (productId) filter.productId = productId;
      if (warehouseId) filter.warehouseId = warehouseId;

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [alerts, total] = await Promise.all([
        Alert.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate("productId", "sku name unit")
          .populate("warehouseId", "name")
          .populate("acknowledgedBy", "username")
          .populate("resolvedBy", "username")
          .lean(),
        Alert.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("[AlertController] Error in getAlerts:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * API 1: Lấy tổng hợp 3 số liệu chính
   * GET /api/alerts/summary
   */
  async getSummary(req, res) {
    try {
      const stats = await Alert.aggregate([
        {
          $match: { status: "ACTIVE" },
        },
        {
          $group: {
            _id: null,
            totalAlerts: { $sum: 1 },
            expiringSoon: {
              $sum: {
                $cond: [
                  {
                    $in: ["$alertType", ["EXPIRING_SOON", "EXPIRED"]],
                  },
                  1,
                  0,
                ],
              },
            },
            lowStock: {
              $sum: {
                $cond: [
                  {
                    $in: ["$alertType", ["LOW_STOCK", "OUT_OF_STOCK"]],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const result =
        stats.length > 0
          ? stats[0]
          : {
              totalAlerts: 0,
              expiringSoon: 0,
              lowStock: 0,
            };

      res.json({
        success: true,
        data: {
          totalAlerts: result.totalAlerts || 0,
          expiringSoon: result.expiringSoon || 0,
          lowStock: result.lowStock || 0,
        },
      });
    } catch (error) {
      console.error("[AlertController] Error in getSummary:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy tổng hợp cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * API 2: Lấy danh sách chi tiết các cảnh báo với search tên thuốc
   * GET /api/alerts/details
   */
  async getDetails(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search = "",
        alertType,
        severity,
        status = "ACTIVE",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      // Build filter
      const filter = {};
      if (alertType) filter.alertType = alertType;
      if (severity) filter.severity = severity;
      if (status) filter.status = status;

      // Search tên thuốc
      if (search && search.trim()) {
        filter.$or = [
          { productName: { $regex: search.trim(), $options: "i" } },
          { productSku: { $regex: search.trim(), $options: "i" } },
        ];
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [alerts, total] = await Promise.all([
        Alert.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate("productId", "sku name unit minimumStock currentStock")
          .populate("warehouseId", "name")
          .populate("inventoryLotId", "lotNumber quantity expiryDate")
          .lean(),
        Alert.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("[AlertController] Error in getDetails:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách chi tiết cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Lấy thống kê alerts (API cũ - giữ lại cho backward compatibility)
   * GET /api/alerts/statistics
   */
  async getStatistics(req, res) {
    try {
      const stats = await Alert.aggregate([
        {
          $match: { status: "ACTIVE" },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            critical: {
              $sum: { $cond: [{ $eq: ["$severity", "CRITICAL"] }, 1, 0] },
            },
            high: { $sum: { $cond: [{ $eq: ["$severity", "HIGH"] }, 1, 0] } },
            medium: {
              $sum: { $cond: [{ $eq: ["$severity", "MEDIUM"] }, 1, 0] },
            },
            low: { $sum: { $cond: [{ $eq: ["$severity", "LOW"] }, 1, 0] } },
            lowStock: {
              $sum: { $cond: [{ $eq: ["$alertType", "LOW_STOCK"] }, 1, 0] },
            },
            outOfStock: {
              $sum: { $cond: [{ $eq: ["$alertType", "OUT_OF_STOCK"] }, 1, 0] },
            },
            expiringSoon: {
              $sum: { $cond: [{ $eq: ["$alertType", "EXPIRING_SOON"] }, 1, 0] },
            },
            expired: {
              $sum: { $cond: [{ $eq: ["$alertType", "EXPIRED"] }, 1, 0] },
            },
          },
        },
      ]);

      res.json({
        success: true,
        data: stats.length > 0 ? stats[0] : {},
      });
    } catch (error) {
      console.error("[AlertController] Error in getStatistics:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy thống kê cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Lấy chi tiết một alert
   * GET /api/alerts/:id
   */
  async getAlertById(req, res) {
    try {
      const { id } = req.params;

      const alert = await Alert.findById(id)
        .populate("productId")
        .populate("warehouseId")
        .populate("inventoryLotId")
        .populate("acknowledgedBy", "username email")
        .populate("resolvedBy", "username email")
        .lean();

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cảnh báo",
        });
      }

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      console.error("[AlertController] Error in getAlertById:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy chi tiết cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Acknowledge (xác nhận đã biết) một alert
   * PATCH /api/alerts/:id/acknowledge
   */
  async acknowledgeAlert(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const userId = req.user?.id; // Từ auth middleware

      const alert = await Alert.findById(id);

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cảnh báo",
        });
      }

      if (alert.status !== "ACTIVE") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể acknowledge alert đang ACTIVE",
        });
      }

      alert.status = "ACKNOWLEDGED";
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();
      if (notes) alert.notes = notes;

      await alert.save();

      res.json({
        success: true,
        message: "Đã xác nhận cảnh báo",
        data: alert,
      });
    } catch (error) {
      console.error("[AlertController] Error in acknowledgeAlert:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi xác nhận cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Resolve (giải quyết) một alert
   * PATCH /api/alerts/:id/resolve
   */
  async resolveAlert(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const userId = req.user?.id; // Từ auth middleware

      const alert = await Alert.findById(id);

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cảnh báo",
        });
      }

      if (alert.status === "RESOLVED") {
        return res.status(400).json({
          success: false,
          message: "Cảnh báo đã được giải quyết rồi",
        });
      }

      alert.status = "RESOLVED";
      alert.resolvedBy = userId;
      alert.resolvedAt = new Date();
      if (notes) alert.notes = notes;

      await alert.save();

      res.json({
        success: true,
        message: "Đã giải quyết cảnh báo",
        data: alert,
      });
    } catch (error) {
      console.error("[AlertController] Error in resolveAlert:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi giải quyết cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Xóa alert (chỉ dành cho admin)
   * DELETE /api/alerts/:id
   */
  async deleteAlert(req, res) {
    try {
      const { id } = req.params;

      const alert = await Alert.findByIdAndDelete(id);

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy cảnh báo",
        });
      }

      res.json({
        success: true,
        message: "Đã xóa cảnh báo",
      });
    } catch (error) {
      console.error("[AlertController] Error in deleteAlert:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi xóa cảnh báo",
        error: error.message,
      });
    }
  },

  /**
   * Chạy scan thủ công (dành cho admin/testing)
   * POST /api/alerts/scan
   */
  async manualScan(req, res) {
    try {
      console.log(
        `[AlertController] Manual scan triggered by user ${req.user?.id}`
      );

      const results = await cronJobs.runManualScan();

      res.json({
        success: true,
        message: "Đã quét kho thành công",
        data: results,
      });
    } catch (error) {
      console.error("[AlertController] Error in manualScan:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi quét kho",
        error: error.message,
      });
    }
  },

  /**
   * Lấy danh sách cron jobs đang chạy
   * GET /api/alerts/jobs
   */
  async getJobs(req, res) {
    try {
      const jobs = cronJobs.getJobs();

      res.json({
        success: true,
        data: jobs,
      });
    } catch (error) {
      console.error("[AlertController] Error in getJobs:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách jobs",
        error: error.message,
      });
    }
  },
};

export default alertController;
