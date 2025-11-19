import Transaction from "../models/transaction.model.js";
import TransactionDetail from "../models/transactionDetail.model.js";
import Product from "../models/product.model.js";
import InventoryLot from "../models/inventoryLot.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import mongoose from "mongoose";

/**
 * @route GET /api/reports/stock_summary
 * @desc Lấy báo cáo xuất-nhập-tồn kho theo khoảng thời gian
 * @param {Date} startDate - Ngày bắt đầu (query param)
 * @param {Date} endDate - Ngày kết thúc (query param)
 * @returns {Object} Danh sách sản phẩm với thông tin tồn đầu kỳ, nhập, xuất, tồn cuối kỳ
 */
export const getStockSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return ApiResponse.error(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return ApiResponse.error(res, "Định dạng ngày không hợp lệ", 400);
    }

    if (start > end) {
      return ApiResponse.error(
        res,
        "startDate phải nhỏ hơn hoặc bằng endDate",
        400
      );
    }

    // Set time to start and end of day
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Get all products
    const products = await Product.find({}).select("_id name unit").lean();

    // Calculate stock summary for each product
    const stockSummary = await Promise.all(
      products.map(async (product) => {
        // 1. Calculate opening stock (tồn đầu kỳ) - stock before startDate
        const openingStock = await calculateStockAtDate(
          product._id,
          new Date(start.getTime() - 1)
        );

        // 2. Calculate total inbound (tổng nhập) in period
        const totalInbound = await calculateTransactionTotal(
          product._id,
          "INBOUND",
          start,
          end
        );

        // 3. Calculate total outbound (tổng xuất) in period
        const totalOutbound = await calculateTransactionTotal(
          product._id,
          "OUTBOUND",
          start,
          end
        );

        // 4. Calculate closing stock (tồn cuối kỳ) = opening + inbound - outbound
        const closingStock = openingStock + totalInbound - totalOutbound;

        return {
          productId: product._id,
          productName: product.name,
          unit: product.unit,
          openingStock,
          totalInbound,
          totalOutbound,
          closingStock,
        };
      })
    );

    // Filter out products with no activity
    const activeProducts = stockSummary.filter(
      (item) =>
        item.openingStock > 0 ||
        item.totalInbound > 0 ||
        item.totalOutbound > 0 ||
        item.closingStock > 0
    );

    return ApiResponse.success(
      res,
      {
        startDate: start,
        endDate: end,
        totalProducts: activeProducts.length,
        products: activeProducts,
      },
      "Lấy báo cáo xuất-nhập-tồn thành công",
      200
    );
  } catch (error) {
    console.error("Error in getStockSummary:", error);
    return ApiResponse.error(
      res,
      "Lỗi khi lấy báo cáo xuất-nhập-tồn",
      500,
      error.message
    );
  }
};

/**
 * Calculate stock quantity at a specific date
 * @param {ObjectId} productId
 * @param {Date} date
 * @returns {Number} Stock quantity at the specified date
 */
async function calculateStockAtDate(productId, date) {
  // Sum all INBOUND transactions up to date
  const inbound = await TransactionDetail.aggregate([
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
      },
    },
    { $unwind: "$transaction" },
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        "transaction.type": "INBOUND",
        "transaction.transactionDate": { $lte: date },
        "transaction.status": "COMPLETED",
      },
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  // Sum all OUTBOUND transactions up to date
  const outbound = await TransactionDetail.aggregate([
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
      },
    },
    { $unwind: "$transaction" },
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        "transaction.type": "OUTBOUND",
        "transaction.transactionDate": { $lte: date },
        "transaction.status": "COMPLETED",
      },
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  const totalInbound = inbound.length > 0 ? inbound[0].totalQuantity : 0;
  const totalOutbound = outbound.length > 0 ? outbound[0].totalQuantity : 0;

  return totalInbound - totalOutbound;
}

/**
 * Calculate total transaction quantity for a product in date range
 * @param {ObjectId} productId
 * @param {String} transactionType - INBOUND or OUTBOUND
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Number} Total quantity
 */
async function calculateTransactionTotal(
  productId,
  transactionType,
  startDate,
  endDate
) {
  const result = await TransactionDetail.aggregate([
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "transaction",
      },
    },
    { $unwind: "$transaction" },
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        "transaction.type": transactionType,
        "transaction.transactionDate": { $gte: startDate, $lte: endDate },
        "transaction.status": "COMPLETED",
      },
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  return result.length > 0 ? result[0].totalQuantity : 0;
}
