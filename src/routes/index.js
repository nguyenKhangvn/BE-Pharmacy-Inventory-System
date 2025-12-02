import express from "express";
import authRoutes from "./auth.route.js";
import userRoutes from "./user.route.js";
import productRoutes from "./product.route.js";
import systemRoutes from "./system.route.js";
import categoryRoutes from "./category.route.js";
import transactionRoutes from "./transaction.route.js";
import supplierRoutes from "./supplier.routes.js";
import inventoryIssueRoutes from "./inventoryIssue.route.js";
import reportRoutes from "./report.route.js";
const router = express.Router();

// Mount routes
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/transactions", transactionRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/inventory-issues", inventoryIssueRoutes);
router.use("/reports", reportRoutes);
router.use("/", systemRoutes);
export default router;
