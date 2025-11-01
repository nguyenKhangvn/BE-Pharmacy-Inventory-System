import mongoose from "mongoose";
import { Category, Product } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";

class CategoryController {
  // @desc    Get all categories with pagination
  // @route   GET /api/categories
  // @access  Private
  static async getCategories(req, res) {
    try {
      const { page = 1, limit = 10, search, isActive } = req.query;

      // Build filter
      const filter = {};
      if (isActive !== undefined) filter.isActive = isActive === "true";
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get categories with product count
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
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) },
      ]);

      const total = await Category.countDocuments(filter);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      };

      return ApiResponse.paginated(
        res,
        categories,
        pagination,
        "Categories retrieved successfully"
      );
    } catch (error) {
      console.error("Get categories error:", error);
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
      ]);

      if (!categoryData || categoryData.length === 0) {
        return ApiResponse.error(res, "Category not found", 404);
      }

      return ApiResponse.success(
        res,
        categoryData[0],
        "Category retrieved successfully"
      );
    } catch (error) {
      console.error("Get category error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Create new category
  // @route   POST /api/categories
  // @access  Private (Admin/Manager)
  static async createCategory(req, res) {
    try {
      const { code, name, description, isActive } = req.body;

      // Check if category with same name already exists
      const existingCategory = await Category.findOne({
        $or: [{ name }, { code }],
      });

      if (existingCategory) {
        if (existingCategory.name === name) {
          return ApiResponse.error(
            res,
            "Category with this name already exists",
            400
          );
        }
        if (existingCategory.code === code) {
          return ApiResponse.error(
            res,
            "Category with this code already exists",
            400
          );
        }
      }

      const category = new Category({
        code,
        name,
        description,
        isActive,
      });

      await category.save();

      // Add productCount field
      const categoryResponse = category.toObject();
      categoryResponse.productCount = 0;

      return ApiResponse.success(
        res,
        categoryResponse,
        "Category created successfully",
        201
      );
    } catch (error) {
      console.error("Create category error:", error);
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
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
      const { code, name, description, isActive } = req.body;

      const category = await Category.findById(id);
      if (!category) {
        return ApiResponse.error(res, "Category not found", 404);
      }

      // Check if new name/code conflicts with existing category
      if (name || code) {
        const query = { _id: { $ne: id } };
        const orConditions = [];
        if (name) orConditions.push({ name });
        if (code) orConditions.push({ code });
        query.$or = orConditions;

        const existingCategory = await Category.findOne(query);
        if (existingCategory) {
          if (existingCategory.name === name) {
            return ApiResponse.error(
              res,
              "Category with this name already exists",
              400
            );
          }
          if (existingCategory.code === code) {
            return ApiResponse.error(
              res,
              "Category with this code already exists",
              400
            );
          }
        }
      }

      // Update fields
      if (code) category.code = code;
      if (name) category.name = name;
      if (description !== undefined) category.description = description;
      if (isActive !== undefined) category.isActive = isActive;

      await category.save();

      // Get product count
      const productCount = await Product.countDocuments({
        categoryId: category._id,
      });

      const categoryResponse = category.toObject();
      categoryResponse.productCount = productCount;

      return ApiResponse.success(
        res,
        categoryResponse,
        "Category updated successfully"
      );
    } catch (error) {
      console.error("Update category error:", error);
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
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
