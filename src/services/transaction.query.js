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
