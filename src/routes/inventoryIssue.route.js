import express from "express";
import InventoryIssueController from "../controllers/inventoryIssue.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";

const router = express.Router();

// @route   GET /api/inventory-issues/product-suggestions
// @desc    Get product suggestions for inventory issue
// @access  Private (admin)
router.get(
  "/product-suggestions",
  auth,
  roleAuth(["admin"]),
  InventoryIssueController.getProductSuggestions
);

// @route   POST /api/inventory-issues
// @desc    Create inventory issue (Phiếu xuất kho)
// @access  Private (admin)
router.post(
  "/",
  auth,
  roleAuth(["admin"]),
  InventoryIssueController.createInventoryIssue
);

export default router;