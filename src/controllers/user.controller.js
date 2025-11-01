import { User } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";
import AuthService from "../services/authService.js";

class UserController {
  // @desc    Get all users in organization
  // @route   GET /api/users
  // @access  Private (Admin/Manager)
  static async getUsers(req, res) {
    try {
      const { page = 1, limit = 10, role, isActive } = req.query;
      const organizationId = req.user.organizationId;

      // Build filter
      const filter = { organizationId };
      if (role) filter.role = role;
      if (isActive !== undefined) filter.isActive = isActive === "true";

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get users with pagination
      const users = await User.find(filter)
        .populate("organization", "name code")
        .select("-hashedPassword")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(filter);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      };

      return ApiResponse.paginated(
        res,
        users,
        pagination,
        "Users retrieved successfully"
      );
    } catch (error) {
      console.error("Get users error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get user by ID
  // @route   GET /api/users/:id
  // @access  Private (Admin/Manager)
  static async getUserById(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const user = await User.findOne({ _id: id, organizationId })
        .populate("organization", "name code address phone")
        .select("-hashedPassword");

      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      return ApiResponse.success(res, user, "User retrieved successfully");
    } catch (error) {
      console.error("Get user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Create new user
  // @route   POST /api/users
  // @access  Private (Admin/Manager)
  static async createUser(req, res) {
    try {
      const { fullName, email, password, role } = req.body;
      const organizationId = req.user.organizationId;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return ApiResponse.error(
          res,
          "User already exists with this email",
          400
        );
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(password);

      // Create user
      const user = new User({
        organizationId,
        fullName,
        email,
        hashedPassword,
        role,
      });

      await user.save();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.hashedPassword;

      return ApiResponse.success(
        res,
        userResponse,
        "User created successfully",
        201
      );
    } catch (error) {
      console.error("Create user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update user
  // @route   PUT /api/users/:id
  // @access  Private (Admin/Manager)
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { fullName, role, isActive } = req.body;
      const organizationId = req.user.organizationId;

      const user = await User.findOne({ _id: id, organizationId });
      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      // Update fields
      if (fullName) user.fullName = fullName;
      if (role) user.role = role;
      if (isActive !== undefined) user.isActive = isActive;

      await user.save();

      return ApiResponse.success(res, user, "User updated successfully");
    } catch (error) {
      console.error("Update user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Delete user (soft delete)
  // @route   DELETE /api/users/:id
  // @access  Private (Admin only)
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const user = await User.findOne({ _id: id, organizationId });
      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      // Soft delete by setting isActive to false
      user.isActive = false;
      await user.save();

      return ApiResponse.success(res, null, "User deleted successfully");
    } catch (error) {
      console.error("Delete user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Reset user password
  // @route   PUT /api/users/:id/reset-password
  // @access  Private (Admin/Manager)
  static async resetPassword(req, res) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      const organizationId = req.user.organizationId;

      const user = await User.findOne({ _id: id, organizationId });
      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(newPassword);
      user.hashedPassword = hashedPassword;

      await user.save();

      return ApiResponse.success(res, null, "Password reset successfully");
    } catch (error) {
      console.error("Reset password error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default UserController;
