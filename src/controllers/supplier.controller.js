import Supplier from "../models/supplier.model.js";
import ApiResponse from "../utils/ApiResponse.js";

class SupplierController {
  // @desc   Lấy danh sách NCC (pagination + search theo tên/mã số thuế/mã)
  // @route  GET /api/suppliers
  // @access Private (Admin)
  static async getSuppliers(req, res) {
    try {
      const {
        q = "",
        page = 1,
        limit = 25,
        sortBy = "createdAt",   // code|name|taxCode|ordersCount|lastOrderAt|status|createdAt
        sortOrder = "desc",     // asc|desc
        status                  // optional filter
      } = req.query;

      // Chuẩn hoá phân trang theo AC (25/50/100)
      const allowed = [25, 50, 100];
      const pageSize = allowed.includes(+limit) ? +limit : 25;
      const pageNum  = Math.max(parseInt(page, 10) || 1, 1);

      // Lọc & tìm kiếm
      const query = {};
      if (q && q.trim()) {
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(safe, "i");
        // tìm theo tên, mã số thuế, mã NCC
        query.$or = [{ name: regex }, { taxCode: regex }, { code: regex }];
      }
      if (status) query.status = status;

      // Chỉ lấy các cột UI cần (bám AC)
      const projection =
        "code name taxCode contactName phone email address ordersCount lastOrderAt status createdAt";

      // Sắp xếp an toàn
      const sortMap = {
        code: "code",
        name: "name",
        taxCode: "taxCode",
        ordersCount: "ordersCount",
        lastOrderAt: "lastOrderAt",
        status: "status",
        createdAt: "createdAt"
      };
      const sortField = sortMap[sortBy] || "createdAt";
      const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };

      // Truy vấn DB
      const [items, total] = await Promise.all([
        Supplier.find(query, projection)
          .sort(sort)
          .skip((pageNum - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        Supplier.countDocuments(query)
      ]);

      // Map DTO theo AC
      const data = items.map(s => ({
        id: String(s._id),
        code: s.code,                         // Mã NCC
        name: s.name,                         // Tên NCC
        address: s.address || "",             // hiển thị kèm tên (FE có thể concat)
        taxCode: s.taxCode || "",
        contactName: s.contactName || "",
        contact: {
          phone: s.phone || "",
          email: s.email || ""
        },
        orders: {
          count: s.ordersCount || 0,
          lastDate: s.lastOrderAt || null
        },
        status: s.status,                     // active/inactive
        createdAt: s.createdAt
      }));

      const pagination = {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize)
      };

      return ApiResponse.paginated(res, data, pagination, "Suppliers retrieved successfully");
    } catch (err) {
      console.error("GET /api/suppliers error:", err);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default SupplierController;
