import express from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

/**
 * @route GET /api/dashboard
 * @desc Lấy dữ liệu tổng quan Dashboard
 * @access Private
 */
router.get("/", auth, roleAuth(["admin"]), getDashboard);

export default router;
