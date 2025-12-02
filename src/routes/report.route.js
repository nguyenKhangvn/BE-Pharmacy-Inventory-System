import express from "express";
import { getStockSummary, getTrends, getStatusDistribution, exportReport } from "../controllers/report.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

// @route GET /api/reports/stock_summary
// @desc Get stock summary report (Báo cáo xuất-nhập-tồn)
// @access Private (admin, user)
router.get(
  "/stock_summary",
  auth,
  roleAuth(["admin", "user"]),
  getStockSummary
);

// @route GET /api/reports/trends
// @desc Get trends report (Biểu đồ nhập/xuất theo tháng)
// @access Private (admin, user)
router.get(
  "/trends",
  auth,
  roleAuth(["admin", "user"]),
  getTrends
);

// @route GET /api/reports/status_distribution
// @desc Get status distribution report (Biểu đồ phân bổ trạng thái)
// @access Private (admin, user)
router.get(
  "/status_distribution",
  auth,
  roleAuth(["admin", "user"]),
  getStatusDistribution
);

// @route GET /api/reports/export
// @desc Export report to PDF file
// @access Private (admin, user)
router.get(
  "/export",
  auth,
  roleAuth(["admin", "user"]),
  exportReport
);

export default router;
