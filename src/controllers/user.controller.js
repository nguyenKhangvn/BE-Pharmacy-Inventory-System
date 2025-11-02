import User from "../models/user.model.js";
import ApiResponse from "../utils/ApiResponse.js";

const ALLOWED_ROLES = ["admin", "user"];
const ALLOWED_STATUS = ["active", "locked"];

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

  // @desc    Create new user
  // @route   POST /api/users
  // @access  Private (admin)
  static async createUser(req, res) {
    try {
      const {
        username,
        fullName,
        email,
        phone,
        password,
        confirmPassword,
        role = "admin",
        status = "active",
      } = req.body || {};

      // --- Validate bắt buộc ---
      if (!username || !email || !password || !confirmPassword) {
        return ApiResponse.error(res, "username, email, password, confirmPassword là bắt buộc", 400);
      }
      if (password.length < 6) {
        return ApiResponse.error(res, "Password phải ít nhất 6 ký tự", 400);
      }
      if (password !== confirmPassword) {
        return ApiResponse.error(res, "Xác nhận mật khẩu không khớp", 400);
      }

      // --- Chuẩn hoá TRƯỚC KHI validate format ---
      const usernameLc = (username || "").trim().toLowerCase();
      const emailLc = (email || "").trim().toLowerCase();

      // Validate email format AFTER trimming
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLc)) {
        return ApiResponse.error(res, "Email không đúng định dạng", 400);
      }

      // --- Kiểm tra trùng ---
      const [dupUser, dupEmail] = await Promise.all([
        User.findOne({ username: usernameLc }).lean(),
        User.findOne({ email: emailLc }).lean(),
      ]);
      if (dupUser) {
        return ApiResponse.error(res, "Tên đăng nhập đã tồn tại", 409);
      }
      if (dupEmail) {
        return ApiResponse.error(res, "Email đã tồn tại", 409);
      }

      // --- Chuẩn hoá role/status ---
      const normalizedRole = ALLOWED_ROLES.includes(role) ? role : "user";
      const normalizedStatus = ALLOWED_STATUS.includes(status) ? status : "active";

      // --- Tạo user ---
      const created = await User.create({
        username: usernameLc,
        fullName: (fullName || "").trim(),
        email: emailLc,
        phone: (phone || "").trim(),
        password,             // pre-save sẽ hash
        role: normalizedRole,
        status: normalizedStatus
      });

      const dto = {
        id: String(created._id),
        username: created.username,
        fullName: created.fullName || "",
        email: created.email,
        phone: created.phone || "",
        role: created.role,
        status: created.status,
        lastLogin: created.lastLogin || null,
      };

      // Trả 201 + message theo AC
      if (typeof ApiResponse.success === "function") {
        return ApiResponse.success(res, dto, "Thêm người dùng thành công", 201);
      }
      // fallback nếu utils không có success()
      return res.status(201).json({
        success: true,
        message: "Thêm người dùng thành công",
        data: dto
      });
    } catch (error) {
      console.error("Create user error:", error);
      return ApiResponse.error
        ? ApiResponse.error(res, "Server error", 500)
        : res.status(500).json({ success: false, message: "Server error" });
    }
  }
}

export default UserController;
