// src/models/TransactionDetail.js
import mongoose from "mongoose";

const TransactionDetailSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    inventoryLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryLot",
    }, // cần cho OUTBOUND/TRANSFER
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

TransactionDetailSchema.index({ transactionId: 1 });
TransactionDetailSchema.index({ productId: 1 });
TransactionDetailSchema.index({ inventoryLotId: 1 });

export default mongoose.model("TransactionDetail", TransactionDetailSchema);
