import express from "express";
import authRoutes from "./auth.route.js";
import userRoutes from "./user.route.js";
import productRoutes from "./product.route.js";
import systemRoutes from "./system.route.js";
import categoryRoutes from "./category.route.js";
const router = express.Router();

// Mount routes
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/", systemRoutes);

export default router;
