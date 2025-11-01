// src/models/User.js
import mongoose from "mongoose";
import { Role } from "./_shared.js";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: { unique: true },
    },
    fullName: { type: String, required: true, trim: true, maxlength: 150 },
    email: {
      type: String,
      required: true,
      trim: true,
      match: /.+@.+\..+/,
      index: { unique: true },
    },
    phone: { type: String },
    role: { type: String, enum: Role, default: "PHARMACIST" },
    isActive: { type: Boolean, default: true },
    hashedPassword: { type: String, required: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

export default mongoose.model("User", UserSchema);
