import express from "express";
import alertController from "../controllers/alert.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

/**
 * Routes cho Alert Management
 * Tất cả routes đều yêu cầu authentication
 */

// Lấy danh sách alerts với filters
router.get("/", auth, alertController.getAlerts);

// Lấy thống kê alerts
router.get("/statistics", auth, alertController.getStatistics);

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
