import mongoose from "mongoose";

const DepartmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String },
    phone: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Department", DepartmentSchema);
