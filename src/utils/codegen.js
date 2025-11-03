import Counter from "../models/counter.model.js";

export async function nextCode(prefix = "CAT", pad = 4) {
  const key = `SEQ_${prefix}`;
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${String(doc.seq).padStart(pad, "0")}`; // ví dụ CAT0001
}
