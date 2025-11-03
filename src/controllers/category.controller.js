import mongoose from "mongoose";
import { Category, Product } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";
import { nextCode } from "../utils/codegen.js";
class CategoryController {
  // @desc    Get all categories with pagination
  // @route   GET /api/categories
  // @access  Private
  static async getCategories(req, res) {
    try {
      const { search, isActive } = req.query;
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const skip = (page - 1) * limit;

      const filter = {};
      if (isActive !== undefined) filter.isActive = isActive === "true";
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const categories = await Category.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "categoryId",
            as: "products",
          },
        },
        { $addFields: { productCount: { $size: "$products" } } },
        { $project: { products: 0 } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]);

      const total = await Category.countDocuments(filter);
      return ApiResponse.paginated(
        res,
        categories,
        { page, limit, total, pages: Math.ceil(total / limit) },
        "Categories retrieved successfully"
      );
    } catch (e) {
      console.error("Get categories error:", e);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get all categories without pagination
  // @route   GET /api/categories-non-pagination
  // @access  Private
  static async getCategoriesNonPagination(req, res) {
    try {
      const { isActive } = req.query;

      // Build filter
      const filter = {};
      if (isActive !== undefined) filter.isActive = isActive === "true";

      // Get all categories with product count
      const categories = await Category.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "categoryId",
            as: "products",
          },
        },
        {
          $addFields: {
            productCount: { $size: "$products" },
          },
        },
        {
          $project: {
            products: 0,
          },
        },
        { $sort: { name: 1 } },
      ]);

      return ApiResponse.success(
        res,
        categories,
        "Categories retrieved successfully"
      );
    } catch (error) {
      console.error("Get categories error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get category by ID
  // @route   GET /api/categories/:id
  // @access  Private
  static async getCategoryById(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return ApiResponse.error(res, "Validation failed", 400);
      }

      const categoryData = await Category.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "categoryId",
            as: "products",
          },
        },
        { $addFields: { productCount: { $size: "$products" } } },
        { $project: { products: 0 } },
      ]);

      if (!categoryData.length)
        return ApiResponse.error(res, "Category not found", 404);

      return ApiResponse.success(
        res,
        categoryData[0],
        "Category retrieved successfully"
      );
    } catch (e) {
      console.error("Get category error:", e);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Create new category
  // @route   POST /api/categories
  // @access  Private (Admin/Manager)
  static async createCategory(req, res) {
    try {
      let { code, name, description, isActive } = req.body;

      if (!name || !name.trim()) {
        return ApiResponse.error(res, "Validation failed", 400, {
          name: "Name is required",
        });
      }
      if (isActive !== undefined && typeof isActive !== "boolean") {
        return ApiResponse.error(res, "Validation failed", 400, {
          isActive: "isActive must be boolean",
        });
      }

      if (!code) {
        code = await nextCode("CAT", 4);
      }

      // Check trùng name/code
      const existing = await Category.findOne({
        $or: [{ name: name.trim() }, { code }],
      });
      if (existing) {
        if (existing.name === name.trim()) {
          return ApiResponse.error(
            res,
            "Category with this name already exists",
            400
          );
        }
        if (existing.code === code) {
          return ApiResponse.error(
            res,
            "Category with this code already exists",
            400
          );
        }
      }

      const category = await Category.create({
        code,
        name: name.trim(),
        description,
        isActive: isActive ?? true,
      });

      const dto = category.toObject();
      dto.productCount = 0;

      return ApiResponse.success(
        res,
        dto,
        "Category created successfully",
        201
      );
    } catch (error) {
      console.error("Create category error:", error);
      if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || "field";
        return ApiResponse.error(
          res,
          `Category with this ${field} already exists`,
          400
        );
      }
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update category
  // @route   PUT /api/categories/:id
  // @access  Private (Admin/Manager)
  static async updateCategory(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return ApiResponse.error(res, "Validation failed", 400);
      }

      const { code, name, description, isActive } = req.body;

      const category = await Category.findById(id);
      if (!category) return ApiResponse.error(res, "Category not found", 404);

      if (isActive !== undefined && typeof isActive !== "boolean") {
        return ApiResponse.error(res, "Validation failed", 400, {
          isActive: "isActive must be boolean",
        });
      }

      if (name || code) {
        const or = [];
        if (name) or.push({ name });
        if (code) or.push({ code });
        if (or.length) {
          const dup = await Category.findOne({ _id: { $ne: id }, $or: or });
          if (dup) {
            if (name && dup.name === name)
              return ApiResponse.error(
                res,
                "Category with this name already exists",
                400
              );
            if (code && dup.code === code)
              return ApiResponse.error(
                res,
                "Category with this code already exists",
                400
              );
          }
        }
      }

      if (code) category.code = code;
      if (name) category.name = name;
      if (description !== undefined) category.description = description;
      if (isActive !== undefined) category.isActive = isActive;

      await category.save();

      const productCount = await Product.countDocuments({
        categoryId: category._id,
      });
      const dto = category.toObject();
      dto.productCount = productCount;

      return ApiResponse.success(res, dto, "Category updated successfully");
    } catch (e) {
      console.error("Update category error:", e);
      if (e?.code === 11000) {
        const field = Object.keys(e.keyPattern || {})[0] || "field";
        return ApiResponse.error(
          res,
          `Category with this ${field} already exists`,
          400
        );
      }
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Delete category
  // @route   DELETE /api/categories/:id
  // @access  Private (Admin only)
  static async deleteCategory(req, res) {
    try {
      const { id } = req.params;

      const category = await Category.findById(id);
      if (!category) {
        return ApiResponse.error(res, "Category not found", 404);
      }

      // Check if category has any products
      const productCount = await Product.countDocuments({ categoryId: id });
      if (productCount > 0) {
        return ApiResponse.error(
          res,
          `Cannot delete category. It has ${productCount} product(s) associated with it.`,
          400
        );
      }

      await category.deleteOne();

      return ApiResponse.success(res, null, "Category deleted successfully");
    } catch (error) {
      console.error("Delete category error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default CategoryController;
