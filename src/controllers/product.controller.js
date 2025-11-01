import { Product } from "../models/index.js";
import ApiResponse from "../utils/ApiResponse.js";

class ProductController {
  // @desc    Get all products
  // @route   GET /api/products
  // @access  Private
  static async getProducts(req, res) {
    try {
      const { page = 1, limit = 10, search, isActive } = req.query;
      const organizationId = req.user.organizationId;

      // Build filter
      const filter = { organizationId };
      if (isActive !== undefined) filter.isActive = isActive === "true";
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { sku: { $regex: search, $options: "i" } },
          { activeIngredient: { $regex: search, $options: "i" } },
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get products with pagination
      const products = await Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Product.countDocuments(filter);

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      };

      return ApiResponse.paginated(
        res,
        products,
        pagination,
        "Products retrieved successfully"
      );
    } catch (error) {
      console.error("Get products error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get product by ID
  // @route   GET /api/products/:id
  // @access  Private
  static async getProductById(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const product = await Product.findOne({ _id: id, organizationId });
      if (!product) {
        return ApiResponse.error(res, "Product not found", 404);
      }

      return ApiResponse.success(
        res,
        product,
        "Product retrieved successfully"
      );
    } catch (error) {
      console.error("Get product error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Create new product
  // @route   POST /api/products
  // @access  Private (Admin/Manager)
  static async createProduct(req, res) {
    try {
      const { sku, name, description, activeIngredient, unit, minimumStock } =
        req.body;
      const organizationId = req.user.organizationId;

      const product = new Product({
        organizationId,
        sku,
        name,
        description,
        activeIngredient,
        unit,
        minimumStock,
      });

      await product.save();

      return ApiResponse.success(
        res,
        product,
        "Product created successfully",
        201
      );
    } catch (error) {
      console.error("Create product error:", error);
      if (error.code === 11000) {
        return ApiResponse.error(res, "Product SKU already exists", 400);
      }
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Update product
  // @route   PUT /api/products/:id
  // @access  Private (Admin/Manager)
  static async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const {
        sku,
        name,
        description,
        activeIngredient,
        unit,
        minimumStock,
        isActive,
      } = req.body;
      const organizationId = req.user.organizationId;

      const product = await Product.findOne({ _id: id, organizationId });
      if (!product) {
        return ApiResponse.error(res, "Product not found", 404);
      }

      // Update fields
      if (sku) product.sku = sku;
      if (name) product.name = name;
      if (description !== undefined) product.description = description;
      if (activeIngredient) product.activeIngredient = activeIngredient;
      if (unit) product.unit = unit;
      if (minimumStock !== undefined) product.minimumStock = minimumStock;
      if (isActive !== undefined) product.isActive = isActive;

      await product.save();

      return ApiResponse.success(res, product, "Product updated successfully");
    } catch (error) {
      console.error("Update product error:", error);
      if (error.code === 11000) {
        return ApiResponse.error(res, "Product SKU already exists", 400);
      }
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Delete product (soft delete)
  // @route   DELETE /api/products/:id
  // @access  Private (Admin only)
  static async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const organizationId = req.user.organizationId;

      const product = await Product.findOne({ _id: id, organizationId });
      if (!product) {
        return ApiResponse.error(res, "Product not found", 404);
      }

      // Soft delete by setting isActive to false
      product.isActive = false;
      await product.save();

      return ApiResponse.success(res, null, "Product deleted successfully");
    } catch (error) {
      console.error("Delete product error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  // @desc    Get low stock products
  // @route   GET /api/products/low-stock
  // @access  Private
  static async getLowStockProducts(req, res) {
    try {
      const organizationId = req.user.organizationId;

      // This would require aggregation with inventory lots
      // For now, return products where minimumStock > 0
      const products = await Product.find({
        organizationId,
        isActive: true,
        minimumStock: { $gt: 0 },
      }).sort({ minimumStock: -1 });

      return ApiResponse.success(
        res,
        products,
        "Low stock products retrieved successfully"
      );
    } catch (error) {
      console.error("Get low stock products error:", error);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default ProductController;
