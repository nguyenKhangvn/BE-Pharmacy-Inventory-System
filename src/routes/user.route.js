import express from "express";
import UserController from "../controllers/user.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Private (admin only)
router.get("/", auth, roleAuth(["admin"]), UserController.getUsers);

// @route   POST /api/users
// @desc    Create new user
// @access  Private (admin only)
router.post("/", auth, roleAuth(["admin"]), UserController.createUser);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private (admin only)
router.get("/:id", auth, roleAuth("admin"), UserController.getUserById);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (admin only)
router.put("/:id", auth, roleAuth(["admin"]), UserController.updateUser);

// @route   PATCH /api/users/:id/status
// @desc    Update user status (active/inactive)
// @access  Private (admin only)
router.patch("/:id/status", auth, roleAuth(["admin"]), UserController.updateUserStatus);


export default router;
