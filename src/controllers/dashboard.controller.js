import Product from "../models/product.model.js";
import InventoryLot from "../models/inventoryLot.model.js";
import Transaction from "../models/transaction.model.js";
import { Alert } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";

/**
 * @route GET /api/dashboard
 * @desc Lấy dữ liệu tổng quan cho Dashboard
 * @returns {Object} KPIs, biểu đồ 7 ngày, và 5 cảnh báo mới nhất
 */
export const getDashboard = async (req, res) => {
  try {
    // 1. KPI: Tổng số loại thuốc (số sản phẩm active)
    const totalProducts = await Product.countDocuments({ isActive: true });

    // 2. KPI: Tổng giá trị tồn kho (từ tất cả các lot)
    const stockValueResult = await InventoryLot.aggregate([
      {
        $match: {
          quantity: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalValue: {
            $sum: { $multiply: ["$quantity", "$unitCost"] },
          },
        },
      },
    ]);
    const totalStockValue = stockValueResult[0]?.totalValue || 0;

    // 3. KPI: Thuốc sắp hết hạn (trong vòng 30 ngày)
    const expiringLots = await InventoryLot.expiringSoon(30);
    const expiringCount = expiringLots.length;

    // 4. KPI: Thuốc dưới tồn tối thiểu
    const lowStockProducts = await Product.aggregate([
      {
        $match: {
          isActive: true,
          $expr: { $lt: ["$currentStock", "$minimumStock"] },
        },
      },
      {
        $count: "count",
      },
    ]);
    const lowStockCount = lowStockProducts[0]?.count || 0;

    // 5. Biểu đồ cột: Nhập/Xuất 7 ngày gần nhất
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const transactionsLast7Days = await Transaction.aggregate([
      {
        $match: {
          transactionDate: {
            $gte: sevenDaysAgo,
            $lte: today,
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" },
            },
            type: "$type",
          },
          totalQuantity: { $sum: "$totalQuantity" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    // Tạo mảng 7 ngày với dữ liệu mặc định
    const chartData = [];
    const daysOfWeek = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const dayOfWeek = daysOfWeek[date.getDay()];

      const inbound = transactionsLast7Days.find(
        (t) => t._id.date === dateStr && t._id.type === "INBOUND"
      )?.totalQuantity || 0;

      const outbound = transactionsLast7Days.find(
        (t) => t._id.date === dateStr && t._id.type === "OUTBOUND"
      )?.totalQuantity || 0;

      chartData.push({
        date: dateStr,
        day: dayOfWeek,
        inbound,
        outbound,
      });
    }

    // 6. Lấy 5 cảnh báo mới nhất (ACTIVE)
    const recentAlerts = await Alert.find({ status: "ACTIVE" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("productId", "sku name unit")
      .populate("warehouseId", "name")
      .lean();

    // Format alerts
    const formattedAlerts = recentAlerts.map((alert) => ({
      id: alert._id,
      type: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      product: alert.productId
        ? {
            id: alert.productId._id,
            sku: alert.productId.sku,
            name: alert.productId.name,
            unit: alert.productId.unit,
          }
        : null,
      warehouse: alert.warehouseId
        ? {
            id: alert.warehouseId._id,
            name: alert.warehouseId.name,
          }
        : null,
      createdAt: alert.createdAt,
    }));

    // Response
    return ApiResponse.success(res, {
      kpis: {
        totalProducts,
        totalStockValue,
        expiringCount,
        lowStockCount,
      },
      chart: chartData,
      alerts: formattedAlerts,
    }, "Lấy dữ liệu dashboard thành công");
  } catch (error) {
    console.error("Get dashboard error:", error);
    return ApiResponse.error(
      res,
      "Lỗi server khi lấy dữ liệu dashboard. Vui lòng thử lại sau.",
      500
    );
  }
};
