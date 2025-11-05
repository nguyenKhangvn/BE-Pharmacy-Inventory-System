import mongoose from "mongoose";

const WarehouseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true },
    address: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

WarehouseSchema.pre("save", async function (next) {
  const count = await mongoose.model("Warehouse").countDocuments();
  if (count > 0 && this.isNew) {
    const err = new Error("Warehouse already exists. Only one allowed.");
    return next(err);
  }
  next();
});

export default mongoose.model("Warehouse", WarehouseSchema);
