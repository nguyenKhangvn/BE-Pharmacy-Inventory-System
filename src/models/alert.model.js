import mongoose from "mongoose";

const AlertSchema = new mongoose.Schema(
  {
    alertType: {
      type: String,
      required: true,
      enum: [
        "LOW_STOCK", // Tồn kho thấp hơn mức tối thiểu
        "OUT_OF_STOCK", // Hết hàng
        "EXPIRING_SOON", // Sắp hết hạn (trong 30 ngày)
        "EXPIRED", // Đã hết hạn
      ],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    productSku: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      index: true,
    },
    inventoryLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryLot",
      index: true,
    },
    lotNumber: {
      type: String,
    },
    currentStock: {
      type: Number,
      min: 0,
    },
    minimumStock: {
      type: Number,
      min: 0,
    },
    expiryDate: {
      type: Date,
    },
    daysUntilExpiry: {
      type: Number,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "ACKNOWLEDGED", "RESOLVED"],
      default: "ACTIVE",
      index: true,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true, versionKey: false }
);

// Compound index để tránh duplicate alerts
AlertSchema.index(
  { alertType: 1, productId: 1, inventoryLotId: 1, status: 1 },
  { unique: false }
);

// Index cho queries thường dùng
AlertSchema.index({ createdAt: -1 });
AlertSchema.index({ status: 1, severity: 1 });

export default mongoose.model("Alert", AlertSchema);
