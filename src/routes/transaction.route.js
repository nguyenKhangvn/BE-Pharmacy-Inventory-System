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

export default router;
