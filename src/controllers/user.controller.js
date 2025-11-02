import User from "../models/user.model.js";
import ApiResponse from "../utils/ApiResponse.js";

class UserController {
  // @desc    Get all users
  // @route   GET /api/users
  // @access  Private
  static async getUsers(req, res) {
    try {
      const {
        q = "",
        page = 1,
        limit = 25,
        sortBy = "createdAt",
        sortOrder = "desc",
        status,
        role,
      } = req.query;

      // Chuẩn hoá phân trang theo AC (25/50/100)
      const allowed = [25, 50, 100];
      const pageSize = allowed.includes(+limit) ? +limit : 25;
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);

      // Lọc & tìm kiếm
      const query = {};
      if (q && q.trim()) {
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(safe, "i");
        query.$or = [
          { username: regex },
          { fullName: regex },
          { email: regex },
          { phone: regex },
        ];
      }
      if (status) query.status = status;
      if (role) query.role = role;

      // Chỉ lấy các cột UI cần (bám AC)
      const projection =
        "username fullName email phone role status lastLogin createdAt";

      // Sắp xếp an toàn
      const sortMap = {
        username: "username",
        createdAt: "createdAt",
        lastLogin: "lastLogin",
        role: "role",
        status: "status",
      };
      const sortField = sortMap[sortBy] || "createdAt";
      const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };

      // Truy vấn
      const [items, total] = await Promise.all([
        User.find(query, projection)
          .sort(sort)
          .skip((pageNum - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        User.countDocuments(query),
      ]);

      // Chuẩn hoá output
      const data = items.map((u) => ({
        id: String(u._id),
        username: u.username,
        fullName: u.fullName || "",
        email: u.email,
        phone: u.phone || "",
        role: u.role,
        status: u.status,
        lastLogin: u.lastLogin || null,
      }));

      const pagination = {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      };

      return ApiResponse.paginated(
        res,
        data,
        pagination,
        "Users retrieved successfully"
      );
    } catch (error) {
      console.error("Get users error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default UserController;
