import express from "express";
import CategoryController from "../controllers/category.controller.js";
import auth from "../middleware/auth.js";
import roleAuth from "../middleware/roleAuth.js";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCategorySearch,
  validateObjectId,
  checkValidation,
} from "../validators/categoryValidator.js";

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories with pagination
// @access  Private
router.get(
  "/",
  auth,
  validateCategorySearch,
  checkValidation,
  CategoryController.getCategories
);

// @route   GET /api/categories/non-pagination
// @desc    Get all categories without pagination
// @access  Private
router.get(
  "/non-pagination",
  auth,
  CategoryController.getCategoriesNonPagination
);

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Private
router.get(
  "/:id",
  auth,
  validateObjectId,
  checkValidation,
  CategoryController.getCategoryById
);

// @route   POST /api/categories
// @desc    Create new category
// @access  Private (Admin only)
router.post(
  "/",
  auth,
  roleAuth(["admin"]),
  validateCreateCategory,
  checkValidation,
  CategoryController.createCategory
);

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private (Admin only)
router.put(
  "/:id",
  auth,
  roleAuth(["admin"]),
  validateObjectId,
  validateUpdateCategory,
  checkValidation,
  CategoryController.updateCategory
);

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private (Admin only)
router.delete(
  "/:id",
  auth,
  roleAuth(["admin"]),
  validateObjectId,
  checkValidation,
  CategoryController.deleteCategory
);

export default router;
