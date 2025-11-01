// src/models/Warehouse.js
import mongoose from "mongoose";

const WarehouseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    address: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Warehouse", WarehouseSchema);
