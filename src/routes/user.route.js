import express from "express";
import UserController from "../controllers/user.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";
import {
  validateCreateUser,
  validateUpdateUser,
  validateResetPassword,
  validatePagination,
  validateObjectId,
  checkValidation,
} from "../validators/userValidator.js";

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users in organization
// @access  Private (Admin/Manager)
router.get(
  "/",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validatePagination,
  checkValidation,
  UserController.getUsers
);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (Admin/Manager)
router.get(
  "/:id",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateObjectId,
  checkValidation,
  UserController.getUserById
);

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin/Manager)
router.post(
  "/",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateCreateUser,
  checkValidation,
  UserController.createUser
);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin/Manager)
router.put(
  "/:id",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateObjectId,
  validateUpdateUser,
  checkValidation,
  UserController.updateUser
);

// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Private (Admin only)
router.delete(
  "/:id",
  auth,
  roleAuth(["ADMIN"]),
  validateObjectId,
  checkValidation,
  UserController.deleteUser
);

// @route   PUT /api/users/:id/reset-password
// @desc    Reset user password
// @access  Private (Admin/Manager)
router.put(
  "/:id/reset-password",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateObjectId,
  validateResetPassword,
  checkValidation,
  UserController.resetPassword
);

export default router;
