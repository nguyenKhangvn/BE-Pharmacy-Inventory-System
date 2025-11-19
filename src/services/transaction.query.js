import mongoose from "mongoose";
import { Transaction, TransactionDetail } from "../models/index.js";

export async function getInboundTransactionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid id");
    err.statusCode = 400;
    throw err;
  }

  const tx = await Transaction.findOne({ _id: id, type: "INBOUND" })
    .populate({ path: "destinationWarehouseId", select: "code name address" })
    .populate({ path: "supplierId", select: "code name status" })
    .lean();

  if (!tx) {
    const err = new Error("Transaction not found");
    err.statusCode = 404;
    throw err;
  }

  // Details: populate product, lot (tuỳ bạn có cần)
  const details = await TransactionDetail.find({ transactionId: id })
    .populate({ path: "productId", select: "sku name unit" })
    .populate({
      path: "inventoryLotId",
      select: "lotNumber expiryDate quantity unitCost",
    })
    .lean();

  return { header: tx, details };
}

/**
 * Get list of OUTBOUND transactions with filters and pagination
 * @param {Object} filters - { search, fromDate, toDate, page, limit }
 */
export async function getOutboundTransactions(filters = {}) {
  const { search = "", fromDate, toDate, page = 1, limit = 10 } = filters;

  const query = { type: "OUTBOUND" };

  // Search by referenceCode or _id
  if (search && search.trim()) {
    const searchTrim = search.trim();
    if (mongoose.isValidObjectId(searchTrim)) {
      query._id = searchTrim;
    } else {
      query.referenceCode = { $regex: searchTrim, $options: "i" };
    }
  }

  // Date range filter
  if (fromDate || toDate) {
    query.transactionDate = {};
    if (fromDate) {
      query.transactionDate.$gte = new Date(fromDate);
    }
    if (toDate) {
      query.transactionDate.$lte = new Date(toDate);
    }
  }

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate({ path: "sourceWarehouseId", select: "code name address" })
      .populate({ path: "departmentId", select: "code name" })
      .populate({ path: "userId", select: "username fullName" })
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get OUTBOUND transaction by ID with details
 * @param {String} id - Transaction ID
 */
export async function getOutboundTransactionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid id");
    err.statusCode = 400;
    throw err;
  }

  const tx = await Transaction.findOne({ _id: id, type: "OUTBOUND" })
    .populate({ path: "sourceWarehouseId", select: "code name address" })
    .populate({ path: "departmentId", select: "code name" })
    .populate({ path: "userId", select: "username fullName" })
    .lean();

  if (!tx) {
    const err = new Error("Transaction not found");
    err.statusCode = 404;
    throw err;
  }

  // Get transaction details
  const details = await TransactionDetail.find({ transactionId: id })
    .populate({ path: "productId", select: "sku name unit" })
    .populate({
      path: "inventoryLotId",
      select: "lotNumber expiryDate quantity unitCost",
    })
    .lean();

  return { header: tx, details };
}
