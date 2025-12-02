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

  // @desc    Get user by ID
  // @route   GET /api/users/:id
  // @access  Private
  static async getUserById(req, res) {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        return ApiResponse.error(res, "ID người dùng không hợp lệ", 400);
      }

      // Tìm user theo ID, không lấy password
      const user = await User.findById(id)
        .select("-password")
        .lean();

      if (!user) {
        return ApiResponse.error(res, "Không tìm thấy người dùng", 404);
      }

      // Chuẩn hoá output theo format chung
      const data = {
        id: String(user._id),
        username: user.username,
        fullName: user.fullName || "",
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      return ApiResponse.success(
        res,
        data,
        "Lấy thông tin người dùng thành công"
      );
    } catch (error) {
      console.error("Get user by ID error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update user info (and/or status/role, optional reset password)
  // @route   PUT /api/users/:id
  // @access  Private (admin)
  static async updateUser(req, res) {
    try {
      const { id } = req.params;

      // Validate ObjectId format
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        return ApiResponse.error(res, "ID người dùng không hợp lệ", 400);
      }

      // Lấy user cần cập nhật
      const user = await User.findById(id);
      if (!user) {
        return ApiResponse.error(res, "Không tìm thấy người dùng", 404);
      }

      // Lấy dữ liệu đầu vào (tất cả đều tùy chọn)
      const {
        username,
        fullName,
        email,
        phone,
        role,
        status,
      } = req.body || {};

      // Chuẩn hoá input
      const next = {};
      if (typeof username === "string") next.username = username.trim().toLowerCase();
      if (typeof email === "string") next.email = email.trim().toLowerCase();
      if (typeof fullName === "string") next.fullName = fullName.trim();
      if (typeof phone === "string") next.phone = phone.trim();

      // Validate email format nếu có cập nhật
      if (next.email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(next.email)) {
          return ApiResponse.error(res, "Email không đúng định dạng", 400);
        }
      }

      // Kiểm tra trùng username/email (bỏ qua chính user hiện tại)
      if (next.username) {
        const dupUser = await User.findOne({ username: next.username, _id: { $ne: id } }).lean();
        if (dupUser) return ApiResponse.error(res, "Tên đăng nhập đã tồn tại", 409);
      }
      if (next.email) {
        const dupEmail = await User.findOne({ email: next.email, _id: { $ne: id } }).lean();
        if (dupEmail) return ApiResponse.error(res, "Email đã tồn tại", 409);
      }

      // Validate & gán role/status nếu có cập nhật
      if (role !== undefined) {
        if (!ALLOWED_ROLES.includes(role)) {
          return ApiResponse.error(res, "Giá trị role không hợp lệ", 400);
        }
        next.role = role;
      }
      if (status !== undefined) {
        if (!ALLOWED_STATUS.includes(status)) {
          return ApiResponse.error(res, "Giá trị status không hợp lệ", 400);
        }
        next.status = status;
      }

      // Gán các trường khác
      if (next.username !== undefined) user.username = next.username;
      if (next.fullName !== undefined) user.fullName = next.fullName;
      if (next.email !== undefined) user.email = next.email;
      if (next.phone !== undefined) user.phone = next.phone;
      if (next.role !== undefined) user.role = next.role;
      if (next.status !== undefined) user.status = next.status;

      await user.save(); // đảm bảo trigger validate & pre-save hooks

      const dto = {
        id: String(user._id),
        username: user.username,
        fullName: user.fullName || "",
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      return ApiResponse.success(res, dto, "Cập nhật thông tin thành công");
    } catch (error) {
      console.error("Update user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update user status only
  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body || {};

      // Validate id
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        return ApiResponse.error(res, "ID người dùng không hợp lệ", 400);
      }

      // Validate body.status
      if (typeof status !== "string" || !ALLOWED_STATUS.includes(status)) {
        return ApiResponse.error(res, `Giá trị status không hợp lệ (chỉ cho phép: ${ALLOWED_STATUS.join(", ")})`, 400);
      }

      // Tìm user
      const user = await User.findById(id);
      if (!user) {
        return ApiResponse.error(res, "Không tìm thấy người dùng", 404);
      }

      // Idempotent: nếu không thay đổi thì trả về OK luôn
      if (user.status === status) {
        const dto = {
          id: String(user._id),
          username: user.username,
          fullName: user.fullName || "",
          email: user.email,
          phone: user.phone || "",
          role: user.role,
          status: user.status,
          lastLogin: user.lastLogin || null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
        return ApiResponse.success(res, dto, "Trạng thái không thay đổi");
      }

      // Cập nhật
      user.status = status;
      await user.save();

      const dto = {
        id: String(user._id),
        username: user.username,
        fullName: user.fullName || "",
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        status: user.status,
        lastLogin: user.lastLogin || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      return ApiResponse.success(res, dto, "Cập nhật trạng thái thành công");
    } catch (error) {
      console.error("Update user status error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default UserController;
