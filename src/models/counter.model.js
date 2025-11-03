import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, index: true }, // ví dụ: SEQ_CATEGORY
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Counter", CounterSchema);
