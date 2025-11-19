import express from "express";
import { getStockSummary, getTrends } from "../controllers/report.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

// @route GET /api/reports/stock_summary
// @desc Get stock summary report (Báo cáo xuất-nhập-tồn)
// @access Private (admin, manager)
router.get(
  "/stock_summary",
  auth,
  roleAuth(["admin", "user"]),
  getStockSummary
);

// @route GET /api/reports/trends
// @desc Get trends report (Biểu đồ nhập/xuất theo tháng)
// @access Private (admin, manager)
router.get(
  "/trends",
  auth,
  roleAuth(["admin", "user"]),
  getTrends
);

export default router;
