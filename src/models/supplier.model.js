// src/models/Supplier.js
import mongoose from "mongoose";
import { SupplierStatus } from "./_shared.js";

const SupplierSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    contactPerson: { type: String, trim: true, maxlength: 150 },
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    taxCode: { type: String, index: { unique: true, sparse: true } },
    status: { type: String, enum: SupplierStatus, default: "ACTIVE" },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Supplier", SupplierSchema);
