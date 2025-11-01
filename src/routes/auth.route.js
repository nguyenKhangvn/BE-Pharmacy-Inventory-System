import express from "express";
import AuthController from "../controllers/auth.controller.js";
import auth from "../middleware/auth.js";
import {
  validateRegister,
  validateLogin,
  checkValidation,
} from "../validators/authValidator.js";
import { validateChangePassword } from "../validators/userValidator.js";

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post(
  "/register",
  validateRegister,
  checkValidation,
  AuthController.register
);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", validateLogin, checkValidation, AuthController.login);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get("/me", auth, AuthController.getMe);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", auth, AuthController.updateProfile);

// @route   PUT /api/auth/change-password
// @desc    Change password
// @access  Private
router.put(
  "/change-password",
  auth,
  validateChangePassword,
  checkValidation,
  AuthController.changePassword
);

export default router;
