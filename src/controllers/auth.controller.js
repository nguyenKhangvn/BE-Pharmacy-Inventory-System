import AuthService from "../services/authService.js";
import { User } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";

class AuthController {
  // @desc    Register user
  // @route   POST /api/auth/register
  // @access  Public
  static async register(req, res) {
    try {
      const { organizationId, fullName, email, password, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }],
      });

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
        role: role || "PHARMACIST",
      });

      await user.save();

      // Generate token
      const token = AuthService.generateToken({
        id: user._id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      });

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
          },
        },
        "User registered successfully",
        201
      );
    } catch (error) {
      console.error("Register error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Login user
  // @route   POST /api/auth/login
  // @access  Public
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user and include password
      const user = await User.findOne({ email }).select("+hashedPassword");
      if (!user) {
        return ApiResponse.error(res, "Invalid credentials", 400);
      }

      // Check password
      const isMatch = await AuthService.comparePassword(
        password,
        user.hashedPassword
      );
      if (!isMatch) {
        return ApiResponse.error(res, "Invalid credentials", 400);
      }

      // Check if user is active
      if (!user.isActive) {
        return ApiResponse.error(res, "Account is deactivated", 400);
      }

      // Update last login
      await user.updateLastLogin();

      // Generate token
      const token = AuthService.generateToken({
        id: user._id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      });

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: user._id,
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            lastLoginAt: user.lastLoginAt,
          },
        },
        "Login successful"
      );
    } catch (error) {
      console.error("Login error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get current user
  // @route   GET /api/auth/me
  // @access  Private
  static async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id).populate(
        "organization",
        "name code address phone"
      );

      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      return ApiResponse.success(
        res,
        user,
        "User profile retrieved successfully"
      );
    } catch (error) {
      console.error("Get user error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update user profile
  // @route   PUT /api/auth/profile
  // @access  Private
  static async updateProfile(req, res) {
    try {
      const { fullName } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      // Update fields
      if (fullName) user.fullName = fullName;

      await user.save();

      return ApiResponse.success(res, user, "Profile updated successfully");
    } catch (error) {
      console.error("Update profile error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Change password
  // @route   PUT /api/auth/change-password
  // @access  Private
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId).select("+hashedPassword");
      if (!user) {
        return ApiResponse.error(res, "User not found", 404);
      }

      // Verify current password
      const isMatch = await AuthService.comparePassword(
        currentPassword,
        user.hashedPassword
      );
      if (!isMatch) {
        return ApiResponse.error(res, "Current password is incorrect", 400);
      }

      // Hash new password
      const hashedPassword = await AuthService.hashPassword(newPassword);
      user.hashedPassword = hashedPassword;

      await user.save();

      return ApiResponse.success(res, null, "Password changed successfully");
    } catch (error) {
      console.error("Change password error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default AuthController;
