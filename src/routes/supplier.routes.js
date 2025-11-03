import express from "express";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";
import SupplierController from "../controllers/supplier.controller.js";

const router = express.Router();

// @route   GET /api/suppliers
// @desc    Get all suppliers
// @access  Private (admin only)
router.get("/", auth, roleAuth(["admin"]), SupplierController.getSuppliers);

// @route   POST /api/suppliers
// @desc    Create new supplier
// @access  Private (admin only)
router.post("/", auth, roleAuth(["admin"]), SupplierController.createSupplier);

export default router;
