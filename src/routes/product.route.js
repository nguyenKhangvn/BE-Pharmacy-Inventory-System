import express from "express";
import ProductController from "../controllers/product.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";
import {
  validateCreateProduct,
  validateUpdateProduct,
  validateProductSearch,
  validateObjectId,
  checkValidation,
} from "../validators/productValidator.js";

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products
// @access  Private
router.get(
  "/",
  auth,
  validateProductSearch,
  checkValidation,
  ProductController.getProducts
);

// @route   GET /api/products/low-stock
// @desc    Get low stock products
// @access  Private
router.get("/low-stock", auth, ProductController.getLowStockProducts);

// @route   GET /api/products/:id
// @desc    Get product by ID
// @access  Private
router.get(
  "/:id",
  auth,
  validateObjectId,
  checkValidation,
  ProductController.getProductById
);

// @route   POST /api/products
// @desc    Create new product
// @access  Private (Admin/Manager)
router.post(
  "/",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateCreateProduct,
  checkValidation,
  ProductController.createProduct
);

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (Admin/Manager)
router.put(
  "/:id",
  auth,
  roleAuth(["ADMIN", "MANAGER"]),
  validateObjectId,
  validateUpdateProduct,
  checkValidation,
  ProductController.updateProduct
);

// @route   DELETE /api/products/:id
// @desc    Delete product (soft delete)
// @access  Private (Admin only)
router.delete(
  "/:id",
  auth,
  roleAuth(["ADMIN"]),
  validateObjectId,
  checkValidation,
  ProductController.deleteProduct
);

export default router;
