import Transaction from "../models/transaction.model.js";
import TransactionDetail from "../models/transactionDetail.model.js";
import Product from "../models/product.model.js";
import ApiResponse from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Lấy đường dẫn thư mục hiện tại (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn tới Font Roboto
const FONT_REGULAR = path.join(__dirname, "../assets/fonts/Roboto/static/Roboto-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/Roboto/static/Roboto-Bold.ttf");

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

/**
 * @route GET /api/reports/trends
 * @desc Lấy dữ liệu biểu đồ nhập/xuất theo tháng
 * @param {Date} startDate - Ngày bắt đầu (query param)
 * @param {Date} endDate - Ngày kết thúc (query param)
 * @returns {Object} Dữ liệu nhập/xuất theo tháng
 */
export const getTrends = async (req, res) => {
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

    // Aggregate INBOUND transactions by month
    const inboundTrends = await Transaction.aggregate([
      {
        $match: {
          type: "INBOUND",
          status: "COMPLETED",
          transactionDate: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: "transactiondetails",
          localField: "_id",
          foreignField: "transactionId",
          as: "details",
        },
      },
      { $unwind: "$details" },
      {
        $group: {
          _id: {
            year: { $year: "$transactionDate" },
            month: { $month: "$transactionDate" },
          },
          totalQuantity: { $sum: "$details.quantity" },
          totalValue: {
            $sum: { $multiply: ["$details.quantity", "$details.unitPrice"] },
          },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          totalQuantity: 1,
          totalValue: 1,
          transactionCount: 1,
        },
      },
      { $sort: { year: 1, month: 1 } },
    ]);

    // Aggregate OUTBOUND transactions by month
    const outboundTrends = await Transaction.aggregate([
      {
        $match: {
          type: "OUTBOUND",
          status: "COMPLETED",
          transactionDate: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: "transactiondetails",
          localField: "_id",
          foreignField: "transactionId",
          as: "details",
        },
      },
      { $unwind: "$details" },
      {
        $group: {
          _id: {
            year: { $year: "$transactionDate" },
            month: { $month: "$transactionDate" },
          },
          totalQuantity: { $sum: "$details.quantity" },
          totalValue: {
            $sum: { $multiply: ["$details.quantity", "$details.unitPrice"] },
          },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          totalQuantity: 1,
          totalValue: 1,
          transactionCount: 1,
        },
      },
      { $sort: { year: 1, month: 1 } },
    ]);

    // Merge inbound and outbound data by month
    const trendsMap = new Map();

    // Process inbound
    inboundTrends.forEach((item) => {
      const key = `${item.year}-${item.month}`;
      trendsMap.set(key, {
        year: item.year,
        month: item.month,
        inbound: {
          totalQuantity: item.totalQuantity,
          totalValue: item.totalValue,
          transactionCount: item.transactionCount,
        },
        outbound: {
          totalQuantity: 0,
          totalValue: 0,
          transactionCount: 0,
        },
      });
    });

    // Process outbound
    outboundTrends.forEach((item) => {
      const key = `${item.year}-${item.month}`;
      if (trendsMap.has(key)) {
        trendsMap.get(key).outbound = {
          totalQuantity: item.totalQuantity,
          totalValue: item.totalValue,
          transactionCount: item.transactionCount,
        };
      } else {
        trendsMap.set(key, {
          year: item.year,
          month: item.month,
          inbound: {
            totalQuantity: 0,
            totalValue: 0,
            transactionCount: 0,
          },
          outbound: {
            totalQuantity: item.totalQuantity,
            totalValue: item.totalValue,
            transactionCount: item.transactionCount,
          },
        });
      }
    });

    // Convert map to array and sort
    const trends = Array.from(trendsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    return ApiResponse.success(
      res,
      {
        startDate: start,
        endDate: end,
        totalMonths: trends.length,
        trends,
      },
      "Lấy dữ liệu biểu đồ thành công",
      200
    );
  } catch (error) {
    console.error("Error in getTrends:", error);
    return ApiResponse.error(
      res,
      "Lỗi khi lấy dữ liệu biểu đồ",
      500,
      error.message
    );
  }
};

/**
 * @route GET /api/reports/status_distribution
 * @desc Lấy dữ liệu phân bổ trạng thái giao dịch (biểu đồ tròn)
 * @param {Date} startDate - Ngày bắt đầu (query param, optional)
 * @param {Date} endDate - Ngày kết thúc (query param, optional)
 * @returns {Object} Phân bổ số lượng giao dịch theo trạng thái
 */
export const getStatusDistribution = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build match filter
    const matchFilter = {};

    // Add date range filter if provided
    if (startDate || endDate) {
      matchFilter.transactionDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return ApiResponse.error(res, "Định dạng startDate không hợp lệ", 400);
        }
        start.setHours(0, 0, 0, 0);
        matchFilter.transactionDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return ApiResponse.error(res, "Định dạng endDate không hợp lệ", 400);
        }
        end.setHours(23, 59, 59, 999);
        matchFilter.transactionDate.$lte = end;
      }

      // Validate date range
      if (startDate && endDate && matchFilter.transactionDate.$gte > matchFilter.transactionDate.$lte) {
        return ApiResponse.error(
          res,
          "startDate phải nhỏ hơn hoặc bằng endDate",
          400
        );
      }
    }

    // Aggregate transactions by status
    const statusDistribution = await Transaction.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
      { $sort: { status: 1 } },
    ]);

    // Calculate total and percentages
    const total = statusDistribution.reduce((sum, item) => sum + item.count, 0);

    const distribution = statusDistribution.map((item) => ({
      status: item.status,
      count: item.count,
      percentage: total > 0 ? Math.round((item.count / total) * 100 * 100) / 100 : 0,
    }));

    return ApiResponse.success(
      res,
      {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        totalTransactions: total,
        distribution,
      },
      "Lấy phân bổ trạng thái thành công",
      200
    );
  } catch (error) {
    console.error("Error in getStatusDistribution:", error);
    return ApiResponse.error(
      res,
      "Lỗi khi lấy phân bổ trạng thái",
      500,
      error.message
    );
  }
};

/**
 * @route GET /api/reports/export
 * @desc Xuất báo cáo ra file PDF
 * @param {String} type - Loại file xuất (pdf)
 * @param {String} reportType - Loại báo cáo (stock_summary, trends, status_distribution)
 * @param {Date} startDate - Ngày bắt đầu (query param)
 * @param {Date} endDate - Ngày kết thúc (query param)
 * @returns {File} File PDF báo cáo
 */
export const exportReport = async (req, res) => {
  try {
    const { type, reportType, startDate, endDate } = req.query;

    // Validate export type
    if (!type || type !== "pdf") {
      return ApiResponse.error(
        res,
        "Loại file không hợp lệ. Chỉ hỗ trợ type=pdf",
        400
      );
    }

    // Validate report type
    const validReportTypes = ["stock_summary", "trends", "status_distribution"];
    if (!reportType || !validReportTypes.includes(reportType)) {
      return ApiResponse.error(
        res,
        `Loại báo cáo không hợp lệ. Hỗ trợ: ${validReportTypes.join(", ")}`,
        400
      );
    }

    // Fetch report data based on report type
    let reportData;
    let title;

    switch (reportType) {
      case "stock_summary":
        if (!startDate || !endDate) {
          return ApiResponse.error(
            res,
            "Báo cáo xuất-nhập-tồn yêu cầu startDate và endDate",
            400
          );
        }
        reportData = await getStockSummaryData(startDate, endDate);
        title = "BÁO CÁO XUẤT - NHẬP - TỒN KHO";
        break;

      case "trends":
        if (!startDate || !endDate) {
          return ApiResponse.error(
            res,
            "Báo cáo xu hướng yêu cầu startDate và endDate",
            400
          );
        }
        reportData = await getTrendsData(startDate, endDate);
        title = "BÁO CÁO XU HƯỚNG NHẬP - XUẤT";
        break;

      case "status_distribution":
        reportData = await getStatusDistributionData(startDate, endDate);
        title = "BÁO CÁO PHÂN BỔ TRẠNG THÁI GIAO DỊCH";
        break;
    }

    // 1. Khởi tạo PDF
    const doc = new PDFDocument({ margin: 30, size: "A4", bufferPages: true });

    // 2. Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=report_${reportType}_${Date.now()}.pdf`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // 3. Đăng ký Font tiếng Việt (QUAN TRỌNG)
    if (fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD)) {
      doc.registerFont("Roboto", FONT_REGULAR);
      doc.registerFont("Roboto-Bold", FONT_BOLD);
    } else {
      console.warn("Không tìm thấy file font Roboto, sử dụng font mặc định.");
      doc.font("Helvetica"); // Fallback
    }

    // 4. Generate PDF content
    generatePDFContent(doc, reportType, reportData, title, startDate, endDate);

    // 5. Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Error in exportReport:", error);
    // If headers not sent, send error response
    if (!res.headersSent) {
      return ApiResponse.error(
        res,
        "Lỗi khi xuất báo cáo",
        500,
        error.message
      );
    }
  }
};

/**
 * Get stock summary data for export
 */
async function getStockSummaryData(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Định dạng ngày không hợp lệ");
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const products = await Product.find({}).select("_id name unit").lean();

  const stockSummary = await Promise.all(
    products.map(async (product) => {
      const openingStock = await calculateStockAtDate(
        product._id,
        new Date(start.getTime() - 1)
      );
      const totalInbound = await calculateTransactionTotal(
        product._id,
        "INBOUND",
        start,
        end
      );
      const totalOutbound = await calculateTransactionTotal(
        product._id,
        "OUTBOUND",
        start,
        end
      );
      const closingStock = openingStock + totalInbound - totalOutbound;

      return {
        productName: product.name,
        unit: product.unit,
        openingStock,
        totalInbound,
        totalOutbound,
        closingStock,
      };
    })
  );

  const activeProducts = stockSummary.filter(
    (item) =>
      item.openingStock > 0 ||
      item.totalInbound > 0 ||
      item.totalOutbound > 0 ||
      item.closingStock > 0
  );

  return {
    startDate: start,
    endDate: end,
    products: activeProducts,
  };
}

/**
 * Get trends data for export
 */
async function getTrendsData(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Định dạng ngày không hợp lệ");
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const inboundTrends = await Transaction.aggregate([
    {
      $match: {
        type: "INBOUND",
        status: "COMPLETED",
        transactionDate: { $gte: start, $lte: end },
      },
    },
    {
      $lookup: {
        from: "transactiondetails",
        localField: "_id",
        foreignField: "transactionId",
        as: "details",
      },
    },
    { $unwind: "$details" },
    {
      $group: {
        _id: {
          year: { $year: "$transactionDate" },
          month: { $month: "$transactionDate" },
        },
        totalQuantity: { $sum: "$details.quantity" },
        totalValue: {
          $sum: { $multiply: ["$details.quantity", "$details.unitPrice"] },
        },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        year: "$_id.year",
        month: "$_id.month",
        totalQuantity: 1,
        totalValue: 1,
        transactionCount: 1,
      },
    },
    { $sort: { year: 1, month: 1 } },
  ]);

  const outboundTrends = await Transaction.aggregate([
    {
      $match: {
        type: "OUTBOUND",
        status: "COMPLETED",
        transactionDate: { $gte: start, $lte: end },
      },
    },
    {
      $lookup: {
        from: "transactiondetails",
        localField: "_id",
        foreignField: "transactionId",
        as: "details",
      },
    },
    { $unwind: "$details" },
    {
      $group: {
        _id: {
          year: { $year: "$transactionDate" },
          month: { $month: "$transactionDate" },
        },
        totalQuantity: { $sum: "$details.quantity" },
        totalValue: {
          $sum: { $multiply: ["$details.quantity", "$details.unitPrice"] },
        },
        transactionCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        year: "$_id.year",
        month: "$_id.month",
        totalQuantity: 1,
        totalValue: 1,
        transactionCount: 1,
      },
    },
    { $sort: { year: 1, month: 1 } },
  ]);

  const trendsMap = new Map();

  inboundTrends.forEach((item) => {
    const key = `${item.year}-${item.month}`;
    trendsMap.set(key, {
      year: item.year,
      month: item.month,
      inbound: {
        totalQuantity: item.totalQuantity,
        totalValue: item.totalValue,
        transactionCount: item.transactionCount,
      },
      outbound: {
        totalQuantity: 0,
        totalValue: 0,
        transactionCount: 0,
      },
    });
  });

  outboundTrends.forEach((item) => {
    const key = `${item.year}-${item.month}`;
    if (trendsMap.has(key)) {
      trendsMap.get(key).outbound = {
        totalQuantity: item.totalQuantity,
        totalValue: item.totalValue,
        transactionCount: item.transactionCount,
      };
    } else {
      trendsMap.set(key, {
        year: item.year,
        month: item.month,
        inbound: {
          totalQuantity: 0,
          totalValue: 0,
          transactionCount: 0,
        },
        outbound: {
          totalQuantity: item.totalQuantity,
          totalValue: item.totalValue,
          transactionCount: item.transactionCount,
        },
      });
    }
  });

  const trends = Array.from(trendsMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return {
    startDate: start,
    endDate: end,
    trends,
  };
}

/**
 * Get status distribution data for export
 */
async function getStatusDistributionData(startDate, endDate) {
  const matchFilter = {};

  if (startDate || endDate) {
    matchFilter.transactionDate = {};

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        throw new Error("Định dạng startDate không hợp lệ");
      }
      start.setHours(0, 0, 0, 0);
      matchFilter.transactionDate.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        throw new Error("Định dạng endDate không hợp lệ");
      }
      end.setHours(23, 59, 59, 999);
      matchFilter.transactionDate.$lte = end;
    }
  }

  const statusDistribution = await Transaction.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        status: "$_id",
        count: 1,
      },
    },
    { $sort: { status: 1 } },
  ]);

  const total = statusDistribution.reduce((sum, item) => sum + item.count, 0);

  const distribution = statusDistribution.map((item) => ({
    status: item.status,
    count: item.count,
    percentage:
      total > 0 ? Math.round((item.count / total) * 100 * 100) / 100 : 0,
  }));

  return {
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    totalTransactions: total,
    distribution,
  };
}

/**
 * Generate PDF content based on report type
 */
function generatePDFContent(doc, reportType, data, title, startDate, endDate) {
  // Header Report
  doc.font("Roboto-Bold").fontSize(18).text(title, { align: "center" });
  doc.moveDown(0.5);

  if (startDate && endDate) {
    doc
      .font("Roboto")
      .fontSize(11)
      .text(
        `Từ ngày: ${new Date(startDate).toLocaleDateString("vi-VN")} - Đến ngày: ${new Date(endDate).toLocaleDateString("vi-VN")}`,
        { align: "center" }
      );
  }

  doc
    .fontSize(10)
    .text(`Ngày xuất: ${new Date().toLocaleString("vi-VN")}`, {
      align: "right",
    });
  doc.moveDown(2);

  // Chọn hàm vẽ bảng tương ứng
  switch (reportType) {
    case "stock_summary":
      generateStockSummaryTable(doc, data);
      break;
    case "trends":
      generateTrendsTable(doc, data);
      break;
    case "status_distribution":
      generateStatusDistributionTable(doc, data);
      break;
  }

  // Footer (Số trang)
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .text(`Trang ${i + 1} / ${range.count}`, 30, doc.page.height - 20, {
        align: "center",
      });
  }
}

/**
 * Core function to draw formatted table with headers and rows
 */
function drawTable(doc, headers, rows, colWidths) {
  const startX = 30;
  let startY = doc.y;
  const rowHeight = 25; // Chiều cao mỗi dòng
  const usableWidth = doc.page.width - 60;

  // 1. Vẽ Header
  doc.font("Roboto-Bold").fontSize(9);

  // Vẽ nền header
  doc
    .fillColor("#eeeeee")
    .rect(startX, startY, usableWidth, rowHeight)
    .fill();
  doc.fillColor("black"); // Reset lại màu chữ

  let currentX = startX;
  headers.forEach((header, i) => {
    // Căn giữa text trong header
    doc.text(header, currentX + 5, startY + 8, {
      width: colWidths[i] - 10,
      align: "center",
    });
    currentX += colWidths[i];
  });

  startY += rowHeight;
  doc.font("Roboto").fontSize(9);

  // 2. Vẽ Rows
  rows.forEach((row, rowIndex) => {
    // Check page break
    if (startY + rowHeight > doc.page.height - 30) {
      doc.addPage();
      startY = 30; // Reset Y về đầu trang mới

      // Vẽ lại header ở trang mới
      doc.font("Roboto-Bold").fontSize(9);
      doc
        .fillColor("#eeeeee")
        .rect(startX, startY, usableWidth, rowHeight)
        .fill();
      doc.fillColor("black");

      let hX = startX;
      headers.forEach((h, i) => {
        doc.text(h, hX + 5, startY + 8, {
          width: colWidths[i] - 10,
          align: "center",
        });
        hX += colWidths[i];
      });
      startY += rowHeight;
      doc.font("Roboto").fontSize(9);
    }

    // Vẽ màu nền xen kẽ (Zebra striping)
    if (rowIndex % 2 === 1) {
      doc
        .fillColor("#f9f9f9")
        .rect(startX, startY, usableWidth, rowHeight)
        .fill();
      doc.fillColor("black");
    }

    let cellX = startX;
    row.forEach((text, i) => {
      // Căn chỉnh: Cột đầu (STT) giữa, Cột chữ (Tên) trái, Cột số phải
      let align = "center";
      if (colWidths[i] > 100) align = "left"; // Cột tên dài
      if (colWidths[i] <= 80 && i > 1) align = "right"; // Cột số

      doc.text(text, cellX + 5, startY + 8, {
        width: colWidths[i] - 10,
        align: align,
        lineBreak: false,
        ellipsis: true,
      });
      cellX += colWidths[i];
    });

    // Vẽ đường kẻ mờ bên dưới mỗi dòng
    doc
      .moveTo(startX, startY + rowHeight)
      .lineTo(startX + usableWidth, startY + rowHeight)
      .lineWidth(0.5)
      .strokeColor("#cccccc")
      .stroke();

    startY += rowHeight;
  });
}

/**
 * Generate Stock Summary table
 */
function generateStockSummaryTable(doc, data) {
  doc
    .fontSize(12)
    .font("Roboto-Bold")
    .text(`Tổng số sản phẩm: ${data.products.length}`);
  doc.moveDown(1);

  const headers = [
    "STT",
    "Tên sản phẩm",
    "ĐVT",
    "Tồn đầu",
    "Nhập",
    "Xuất",
    "Tồn cuối",
  ];
  // Tổng width = 595 (A4) - 60 (margin) = 535
  const colWidths = [30, 205, 50, 60, 60, 60, 70];

  const rows = data.products.map((p, index) => [
    (index + 1).toString(),
    p.productName,
    p.unit,
    p.openingStock.toString(),
    p.totalInbound.toString(),
    p.totalOutbound.toString(),
    p.closingStock.toString(),
  ]);

  drawTable(doc, headers, rows, colWidths);
}

/**
 * Generate Trends table
 */
function generateTrendsTable(doc, data) {
  doc
    .fontSize(12)
    .font("Roboto-Bold")
    .text(`Tổng số tháng: ${data.trends.length}`);
  doc.moveDown(1);

  const headers = [
    "STT",
    "Tháng/Năm",
    "Nhập (SL)",
    "Nhập (VNĐ)",
    "Xuất (SL)",
    "Xuất (VNĐ)",
    "Số GD",
  ];
  const colWidths = [30, 70, 70, 100, 70, 100, 65];

  const rows = data.trends.map((t, index) => [
    (index + 1).toString(),
    `${t.month}/${t.year}`,
    t.inbound.totalQuantity.toString(),
    t.inbound.totalValue.toLocaleString("vi-VN"),
    t.outbound.totalQuantity.toString(),
    t.outbound.totalValue.toLocaleString("vi-VN"),
    (t.inbound.transactionCount + t.outbound.transactionCount).toString(),
  ]);

  drawTable(doc, headers, rows, colWidths);
}

/**
 * Generate Status Distribution table
 */
function generateStatusDistributionTable(doc, data) {
  doc
    .fontSize(12)
    .font("Roboto-Bold")
    .text(`Tổng số giao dịch: ${data.totalTransactions}`);
  doc.moveDown(1);

  const headers = ["STT", "Trạng thái", "Số lượng", "Tỷ lệ (%)"];
  const colWidths = [50, 250, 100, 135];

  const statusLabels = {
    COMPLETED: "Hoàn thành",
    DRAFT: "Nháp",
    CANCELED: "Đã hủy",
  };

  const rows = data.distribution.map((item, index) => [
    (index + 1).toString(),
    statusLabels[item.status] || item.status,
    item.count.toString(),
    `${item.percentage}%`,
  ]);

  drawTable(doc, headers, rows, colWidths);
}
