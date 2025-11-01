import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    name: { type: String, required: true, trim: true, maxlength: 250 },
    description: { type: String },
    activeIngredient: { type: String },
    unit: { type: String, required: true, maxlength: 32 }, // viên/ống/chai...
    minimumStock: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Product", ProductSchema);
