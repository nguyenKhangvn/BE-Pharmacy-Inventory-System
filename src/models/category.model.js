import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: { unique: true },
    },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("Category", CategorySchema);
