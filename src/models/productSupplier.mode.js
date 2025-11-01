import mongoose from "mongoose";

const ProductSupplierSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

ProductSupplierSchema.index({ productId: 1, supplierId: 1 }, { unique: true });
ProductSupplierSchema.index({ supplierId: 1 });

export default mongoose.model("ProductSupplier", ProductSupplierSchema);
