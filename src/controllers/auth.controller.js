import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import ApiResponse from "../utils/ApiResponse.js";

class AuthController {
  // @desc    Login user
  // @route   POST /api/auth/login
  // @access  Public
  static async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return ApiResponse.error(
          res,
          "Please enter both username and password",
          400
        );
      }

      const user = await User.findOne({ username });
      if (!user) {
        return ApiResponse.error(res, "Invalid username or password", 401);
      }

      if (user.status === "locked") {
        return ApiResponse.error(
          res,
          "Account is locked. Please contact admin.",
          403
        );
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return ApiResponse.error(res, "Invalid username or password", 401);
      }

      user.lastLogin = Date.now();
      await user.save();

      const token = jwt.sign(
        {
          id: user._id,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || "7d" }
      );

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
          },
        },
        "Login successful",
        200
      );
    } catch (error) {
      console.error("Login error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Register user
  // @route   POST /api/auth/register
  // @access  Public
  static async register(req, res) {
    try {
      const { username, password, email, fullName, phone, role } = req.body;

      if (!username || !password || !email) {
        return ApiResponse.error(
          res,
          "Please enter username, password and email",
          400
        );
      }

      if (password.length < 6) {
        return ApiResponse.error(
          res,
          "Password must be at least 6 characters",
          400
        );
      }

      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return ApiResponse.error(res, "Username already exists", 409);
      }

      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return ApiResponse.error(res, "Email already exists", 409);
      }

      const newUser = await User.create({
        username,
        password,
        email,
        fullName: fullName || username,
        phone: phone || "",
        role: role || "user",
      });

      const token = jwt.sign(
        {
          userId: newUser._id,
          username: newUser.username,
          role: newUser.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
      );

      return ApiResponse.success(
        res,
        {
          token,
          user: {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email,
            fullName: newUser.fullName,
            role: newUser.role,
          },
        },
        "Registration successful",
        201
      );
    } catch (error) {
      console.error("Register error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default AuthController;
