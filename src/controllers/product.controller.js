import mongoose from "mongoose";
import ApiResponse from "../utils/ApiResponse.js";
import { Product } from "../models/index.js";

const { ObjectId } = mongoose.Types;

class ProductController {
  // @desc    Get products (with/without pagination)
  // @route   GET /api/products
  // @access  Private
  static async getProducts(req, res) {
    try {
      // Query đã được Joi validate và convert, lưu trong validatedQuery
      const query = req.validatedQuery || req.query;
      const {
        page = 1,
        limit = 10,
        search,
        categoryId,
        supplierId,
        isActive,
        pagination = true, // <-- dùng flag này
      } = query;

      const skip = (Number(page) - 1) * Number(limit);

      // match conditions
      const match = {};
      if (typeof isActive === "boolean") match.isActive = isActive;
      if (categoryId) match.categoryId = new ObjectId(categoryId);
      if (search && String(search).trim()) {
        match.$or = [
          { name: { $regex: search, $options: "i" } },
          { sku: { $regex: search, $options: "i" } },
        ];
      }

      // Base pipeline chung
      const basePipeline = [
        { $match: match },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "productsuppliers",
            let: { pid: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$productId", "$$pid"] } } },
              ...(supplierId
                ? [{ $match: { supplierId: new ObjectId(supplierId) } }]
                : []),
            ],
            as: "ps",
          },
        },
        ...(supplierId ? [{ $match: { "ps.0": { $exists: true } } }] : []),
        { $addFields: { suppliersCount: { $size: "$ps" } } },
        {
          $project: {
            ps: 0,
            __v: 0,
            description: 0, // ẩn bớt nếu muốn
          },
        },
      ];

      // Nếu không phân trang → trả full list (đã sort)
      if (!pagination) {
        const list = await Product.aggregate([
          ...basePipeline,
          { $sort: { name: 1 } },
          {
            $project: {
              _id: 1,
              sku: 1,
              name: 1,
              unit: 1,
              minimumStock: 1,
              isActive: 1,
              category: { _id: "$category._id", name: "$category.name" },
              suppliersCount: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ]);

        return ApiResponse.success(
          res,
          list,
          "Products retrieved successfully"
        );
      }

      // Có phân trang → facet lấy data + total
      const pipeline = [
        ...basePipeline,
        {
          $facet: {
            data: [
              { $sort: { createdAt: -1, _id: 1 } },
              { $skip: skip },
              { $limit: Number(limit) },
              {
                $project: {
                  _id: 1,
                  sku: 1,
                  name: 1,
                  unit: 1,
                  minimumStock: 1,
                  isActive: 1,
                  category: { _id: "$category._id", name: "$category.name" },
                  suppliersCount: 1,
                  createdAt: 1,
                  updatedAt: 1,
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
        {
          $project: {
            data: 1,
            total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          },
        },
      ];

      const agg = await Product.aggregate(pipeline);
      const items = agg?.[0]?.data || [];
      const total = agg?.[0]?.total || 0;

      return ApiResponse.paginated(
        res,
        items,
        {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.max(1, Math.ceil(total / Number(limit))),
        },
        "Products retrieved successfully"
      );
    } catch (e) {
      console.error("Get products error:", e);
      return ApiResponse.error(res, e.message || "Server error", 500);
    }
  }

  // Giữ nguyên getProductById nếu bạn cần, hoặc chỉ dùng 1 route /:id
  static async getProductById(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return ApiResponse.error(res, "Validation failed", 400);
      }

      const data = await Product.aggregate([
        { $match: { _id: new ObjectId(id) } },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "productsuppliers",
            let: { pid: "$_id" },
            pipeline: [{ $match: { $expr: { $eq: ["$productId", "$$pid"] } } }],
            as: "ps",
          },
        },
        { $addFields: { suppliersCount: { $size: "$ps" } } },
        {
          $project: {
            ps: 0,
            __v: 0,
          },
        },
      ]);

      if (!data.length) {
        return ApiResponse.error(res, "Product not found", 404);
      }

      const p = data[0];
      const dto = {
        _id: p._id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        minimumStock: p.minimumStock,
        isActive: p.isActive,
        category: p.category
          ? { _id: p.category._id, name: p.category.name }
          : null,
        suppliersCount: p.suppliersCount ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        description: p.description,
        activeIngredient: p.activeIngredient,
      };

      return ApiResponse.success(res, dto, "Product retrieved successfully");
    } catch (e) {
      console.error("Get product by id error:", e);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default ProductController;
