// src/models/Transaction.js
import mongoose from "mongoose";
import { TxType, TxStatus } from "./_shared.js";

const TransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TxType, required: true },
    status: { type: String, enum: TxStatus, default: "DRAFT" },
    referenceCode: { type: String },
    notes: { type: String },
    transactionDate: { type: Date, required: true, default: () => new Date() },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // INBOUND
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    destinationWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
    },

    // OUTBOUND
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    sourceWarehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
    },

    // TRANSFER uses sourceWarehouseId + destinationWarehouseId
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

TransactionSchema.index({ transactionDate: 1, type: 1 });
TransactionSchema.index({ status: 1 });

// Ràng buộc theo type (routing fields)
TransactionSchema.pre("validate", function (next) {
  const t = this;
  const ok =
    (t.type === "INBOUND" &&
      t.destinationWarehouseId &&
      t.supplierId &&
      !t.sourceWarehouseId) ||
    (t.type === "OUTBOUND" &&
      t.sourceWarehouseId &&
      t.departmentId &&
      !t.destinationWarehouseId) ||
    (t.type === "TRANSFER" &&
      t.sourceWarehouseId &&
      t.destinationWarehouseId &&
      String(t.sourceWarehouseId) !== String(t.destinationWarehouseId)) ||
    t.type === "ADJUSTMENT";

  if (!ok)
    return next(new Error("Invalid routing fields for transaction type"));
  next();
});

export default mongoose.model("Transaction", TransactionSchema);
