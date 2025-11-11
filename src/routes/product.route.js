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
// @access  Private (admin)
router.post(
  "/",
  auth,
  roleAuth(["admin"]),
  validateCreateProduct,
  checkValidation,
  ProductController.createProduct
);

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private (admin)
router.put(
  "/:id",
  auth,
  roleAuth(["admin"]),
  validateObjectId,
  validateUpdateProduct,
  checkValidation,
  ProductController.updateProduct
);

// @route   DELETE /api/products/:id
// @desc    Delete product (soft delete)
// @access  Private (admin only)
router.delete(
  "/:id",
  auth,
  roleAuth(["admin"]),
  validateObjectId,
  checkValidation,
  ProductController.deleteProduct
);

export default router;
