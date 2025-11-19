import express from "express";
import TransactionController from "../controllers/transaction.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

router.post(
  "/",
  auth,
  roleAuth(["admin", "user"]), // Cả admin và user đều có thể tạo transaction
  TransactionController.create
);

// GET /api/transactions?type=OUTBOUND&search=&fromDate=&toDate=&page=&limit=
router.get(
  "/",
  auth,
  roleAuth(["admin", "user"]),
  TransactionController.getList
);

// GET /api/transactions/:id?type=OUTBOUND or type=INBOUND
router.get(
  "/:id",
  auth,
  roleAuth(["admin", "user"]),
  TransactionController.getById
);

export default router;
