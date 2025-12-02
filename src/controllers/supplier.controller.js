import Supplier from "../models/supplier.model.js";
import ApiResponse from "../utils/ApiResponse.js";

// Danh sách field được phép sort
const ALLOWED_SORT_FIELDS = ["createdAt", "name", "lastOrderAt", "code"];
const ALLOWED_STATUS = ["active", "locked"];

// Projection fields
const PROJECTION =
  "code name taxCode contactName phone email address ordersCount lastOrderAt status createdAt";

class SupplierController {
  // @desc    Get all suppliers with pagination, search, filter
  // @route   GET /api/suppliers
  // @access  Private
  static async getSuppliers(req, res) {
    try {
      const {
        q = "",
        page = 1,
        limit = 25,
        sortBy = "createdAt",
        sortOrder = "desc",
        status,
      } = req.query;

      // Chuẩn hoá phân trang theo AC (25/50/100)
      const allowedLimits = [25, 50, 100];
      const pageSize = allowedLimits.includes(+limit) ? +limit : 25;
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);

      // Xây dựng query
      const query = {};

      // Filter theo status nếu có
      if (status) {
        query.status = status;
      }

      // Tìm kiếm theo tên, mã số thuế, hoặc mã NCC
      if (q && q.trim()) {
        const searchTerm = q.trim();
        // Escape regex special characters
        const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");

        query.$or = [
          { name: regex },
          { taxCode: regex },
          { code: regex },
        ];
      }

      // Sắp xếp
      const sortField = ALLOWED_SORT_FIELDS.includes(sortBy)
        ? sortBy
        : "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;
      const sortObj = { [sortField]: sortDirection };

      // Query với pagination
      const skip = (pageNum - 1) * pageSize;
      const [items, total] = await Promise.all([
        Supplier.find(query, PROJECTION)
          .sort(sortObj)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Supplier.countDocuments(query),
      ]);

      // Map sang DTO
      const data = items.map((item) => ({
        id: String(item._id),
        code: item.code,
        name: item.name,
        address: item.address || "",
        taxCode: item.taxCode || "",
        contactName: item.contactName || "",
        contact: {
          phone: item.phone || "",
          email: item.email || "",
        },
        orders: {
          count: item.ordersCount || 0,
          lastDate: item.lastOrderAt || null,
        },
        status: item.status,
      }));

      // Pagination metadata
      const pagination = {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize) || 0,
      };

      return ApiResponse.paginated(
        res,
        data,
        pagination,
        "Suppliers retrieved successfully"
      );
    } catch (error) {
      console.error("GET /api/suppliers error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Create new supplier
  // @route   POST /api/suppliers
  // @access  Private (admin)
  static async createSupplier(req, res) {
    try {
      const {
        name,
        phone,
        email,
        address,
        taxCode,
        contactName,
        status,
      } = req.body || {};

      // --- Validation bắt buộc ---
      if (!name || !phone || !email || !address) {
        return ApiResponse.error(
          res,
          "name, phone, email, address là bắt buộc",
          400
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const emailTrimmed = (email || "").trim().toLowerCase();
      if (!emailRegex.test(emailTrimmed)) {
        return ApiResponse.error(res, "Email không đúng định dạng", 400);
      }

      // --- Chuẩn hoá dữ liệu ---
      const normalized = {
        name: (name || "").trim(),
        phone: (phone || "").trim(),
        email: emailTrimmed,
        address: (address || "").trim(),
        taxCode: (taxCode || "").trim(),
        contactName: (contactName || "").trim(),
      };

      // Normalize status
      const normalizedStatus = ALLOWED_STATUS.includes(status)
        ? status
        : "active";

      // --- Lấy mã supplier cuối cùng để sinh mã mới ---
      let lastSupplier;
      try {
        lastSupplier = await Supplier.findOne({}, { code: 1 })
          .sort({ createdAt: -1 })
          .lean();
      } catch (err) {
        console.error("Error fetching last supplier:", err);
        return ApiResponse.error(res, "Server error", 500);
      }

      // Sinh mã mới
      let nextCode;
      if (lastSupplier && lastSupplier.code) {
        const match = lastSupplier.code.match(/\d+$/);
        if (match) {
          const lastNumber = parseInt(match[0], 10);
          const newNumber = lastNumber + 1;
          nextCode = `SUP${String(newNumber).padStart(4, "0")}`;
        } else {
          nextCode = "SUP0001";
        }
      } else {
        nextCode = "SUP0001";
      }

      // --- Retry logic khi trùng code ---
      const MAX_RETRIES = 5;
      let attempts = 0;
      let created = null;

      while (attempts < MAX_RETRIES) {
        try {
          created = await Supplier.create({
            code: nextCode,
            ...normalized,
            status: normalizedStatus,
          });
          break; // Thành công, thoát vòng lặp
        } catch (err) {
          // Kiểm tra lỗi duplicate key trên code
          if (err.code === 11000 && err.keyPattern?.code) {
            attempts++;
            // Tăng mã lên 1
            const match = nextCode.match(/\d+$/);
            if (match) {
              const num = parseInt(match[0], 10) + 1;
              nextCode = `SUP${String(num).padStart(4, "0")}`;
            } else {
              // Không parse được, fallback
              nextCode = `SUP${String(Date.now()).slice(-4)}`;
            }
          } else {
            // Lỗi khác, throw ra ngoài
            throw err;
          }
        }
      }

      // Nếu retry hết mà vẫn không tạo được
      if (!created) {
        return ApiResponse.error(
          res,
          "Không thể tạo mã nhà cung cấp sau nhiều lần thử",
          409
        );
      }

      // --- Map sang DTO ---
      const data = {
        id: String(created._id),
        code: created.code,
        name: created.name,
        address: created.address || "",
        taxCode: created.taxCode || "",
        contactName: created.contactName || "",
        contact: {
          phone: created.phone || "",
          email: created.email || "",
        },
        orders: {
          count: created.ordersCount || 0,
          lastDate: created.lastOrderAt || null,
        },
        status: created.status,
        createdAt: created.createdAt,
      };

      return ApiResponse.success(
        res,
        data,
        "Thêm nhà cung cấp thành công",
        201
      );
    } catch (error) {
      console.error("Create supplier error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update supplier
  // @route   PUT /api/suppliers/:id
  // @access  Private (admin)
  static async updateSupplier(req, res) {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        return ApiResponse.error(res, "ID nhà cung cấp không hợp lệ", 400);
      }

      // Tìm supplier
      const supplier = await Supplier.findById(id);
      if (!supplier) {
        return ApiResponse.error(res, "Không tìm thấy nhà cung cấp", 404);
      }

      const {
        name,
        phone,
        email,
        address,
        taxCode,
        contactName,
        status,
      } = req.body || {};

      // --- Chuẩn hoá và validate ---
      
      // Nếu có email, validate format
      if (email !== undefined) {
        const emailTrimmed = (email || "").trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed)) {
          return ApiResponse.error(res, "Email không đúng định dạng", 400);
        }
        supplier.email = emailTrimmed;
      }

      // Nếu có status, validate
      if (status !== undefined) {
        if (!ALLOWED_STATUS.includes(status)) {
          return ApiResponse.error(
            res,
            `status không hợp lệ. Chỉ chấp nhận: ${ALLOWED_STATUS.join(", ")}`,
            400
          );
        }
        supplier.status = status;
      }

      // Cập nhật các fields khác nếu có
      if (name !== undefined) {
        const nameTrimmed = (name || "").trim();
        supplier.name = nameTrimmed;
      }

      if (phone !== undefined) {
        const phoneTrimmed = (phone || "").trim();
        supplier.phone = phoneTrimmed;
      }

      if (address !== undefined) {
        const addressTrimmed = (address || "").trim();
        supplier.address = addressTrimmed;
      }

      if (taxCode !== undefined) {
        supplier.taxCode = (taxCode || "").trim();
      }

      if (contactName !== undefined) {
        supplier.contactName = (contactName || "").trim();
      }

      // Validate required fields sau khi update
      if (
        !supplier.name ||
        !supplier.phone ||
        !supplier.email ||
        !supplier.address
      ) {
        return ApiResponse.error(
          res,
          "name, phone, email, address là bắt buộc",
          400
        );
      }

      // Code không được phép thay đổi (bỏ qua nếu có trong body)
      // supplier.code sẽ không bị thay đổi

      // Lưu thay đổi
      await supplier.save();

      // --- Map sang DTO ---
      const data = {
        id: String(supplier._id),
        code: supplier.code,
        name: supplier.name,
        address: supplier.address || "",
        taxCode: supplier.taxCode || "",
        contactName: supplier.contactName || "",
        contact: {
          phone: supplier.phone || "",
          email: supplier.email || "",
        },
        orders: {
          count: supplier.ordersCount || 0,
          lastDate: supplier.lastOrderAt || null,
        },
        status: supplier.status,
        updatedAt: supplier.updatedAt,
      };

      return ApiResponse.success(
        res,
        data,
        "Cập nhật thông tin thành công",
        200
      );
    } catch (error) {
      console.error("Update supplier error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default SupplierController;
