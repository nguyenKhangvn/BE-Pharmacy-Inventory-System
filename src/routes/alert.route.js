import express from "express";
import alertController from "../controllers/alert.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

/**
 * Routes cho Alert Management
 * Tất cả routes đều yêu cầu authentication
 */

// API 1: Lấy tổng hợp 3 số liệu (Sắp hết hạn, Sắp hết tồn kho, Tổng cảnh báo)
router.get("/summary", auth, alertController.getSummary);

// API 2: Lấy danh sách chi tiết các cảnh báo (hỗ trợ search tên thuốc)
router.get("/details", auth, alertController.getDetails);

// Lấy thống kê alerts (API cũ - giữ lại)
router.get("/statistics", auth, alertController.getStatistics);

// Lấy danh sách alerts với filters (API cũ - giữ lại)
router.get("/", auth, alertController.getAlerts);

// Lấy danh sách cron jobs đang chạy
router.get("/jobs", auth, alertController.getJobs);

// Chạy scan thủ công (dành cho admin)
router.post("/scan", auth, alertController.manualScan);

// Lấy chi tiết một alert
router.get("/:id", auth, alertController.getAlertById);

// Acknowledge một alert
router.patch("/:id/acknowledge", auth, alertController.acknowledgeAlert);

// Resolve một alert
router.patch("/:id/resolve", auth, alertController.resolveAlert);

// Xóa alert (dành cho admin)
router.delete("/:id", auth, alertController.deleteAlert);

export default router;
