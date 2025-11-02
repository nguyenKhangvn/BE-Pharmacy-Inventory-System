import express from "express";
import UserController from "../controllers/user.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users
// @access  Private (admin only)
router.get("/", auth, roleAuth(["admin"]), UserController.getUsers);

export default router;
