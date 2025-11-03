// src/models/Supplier.js
import mongoose from "mongoose";
import { SupplierStatus } from "./_shared.js";

const SupplierSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Mã nhà cung cấp là bắt buộc"],
      trim: true,
      maxlength: [64, "Mã nhà cung cấp không được quá 64 ký tự"],
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Tên nhà cung cấp là bắt buộc"],
      trim: true,
      maxlength: [200, "Tên nhà cung cấp không được quá 200 ký tự"],
      index: true, // For search
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: [150, "Tên người liên hệ không được quá 150 ký tự"],
      default: "",
    },
    phone: {
      type: String,
      required: [true, "Số điện thoại là bắt buộc"],
      trim: true,
      maxlength: [20, "Số điện thoại không được quá 20 ký tự"],
    },
    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      trim: true,
      lowercase: true,
      maxlength: [100, "Email không được quá 100 ký tự"],
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Email không đúng định dạng",
      ],
    },
    address: {
      type: String,
      required: [true, "Địa chỉ là bắt buộc"],
      trim: true,
      maxlength: [500, "Địa chỉ không được quá 500 ký tự"],
    },
    taxCode: {
      type: String,
      trim: true,
      maxlength: [20, "Mã số thuế không được quá 20 ký tự"],
      sparse: true,
      index: true, // For search
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: SupplierStatus,
        message: "Trạng thái không hợp lệ. Chỉ chấp nhận: {VALUES}",
      },
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

// Index cho tìm kiếm theo tên và mã số thuế
SupplierSchema.index({ name: 1, taxCode: 1 });

// Index cho sắp xếp theo ngày tạo
SupplierSchema.index({ createdAt: -1 });

// Tự động tạo mã nhà cung cấp nếu không có
SupplierSchema.pre("save", async function (next) {
  if (this.isNew && !this.code) {
    try {
      // Lấy nhà cung cấp cuối cùng
      const lastSupplier = await this.constructor
        .findOne({}, { code: 1 })
        .sort({ createdAt: -1 })
        .lean();

      if (lastSupplier && lastSupplier.code) {
        // Extract số từ mã cuối cùng (ví dụ: NCC001 -> 001)
        const match = lastSupplier.code.match(/\d+$/);
        if (match) {
          const lastNumber = parseInt(match[0], 10);
          const newNumber = lastNumber + 1;
          this.code = `NCC${String(newNumber).padStart(3, "0")}`;
        } else {
          this.code = "NCC001";
        }
      } else {
        // Nhà cung cấp đầu tiên
        this.code = "NCC001";
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Virtual field để tính số lượng đơn hàng (sẽ populate từ PurchaseOrder)
SupplierSchema.virtual("orderCount", {
  ref: "PurchaseOrder",
  localField: "_id",
  foreignField: "supplier",
  count: true,
});

// Virtual field để lấy đơn hàng gần nhất
SupplierSchema.virtual("lastOrderDate", {
  ref: "PurchaseOrder",
  localField: "_id",
  foreignField: "supplier",
  justOne: true,
  options: { sort: { createdAt: -1 }, select: "createdAt" },
});

// Static method: Tìm kiếm nhà cung cấp
SupplierSchema.statics.search = function (query) {
  const searchRegex = new RegExp(query, "i");
  return this.find({
    $or: [
      { name: searchRegex },
      { taxCode: searchRegex },
      { code: searchRegex },
    ],
  });
};

// Static method: Kiểm tra trùng lặp mã số thuế
SupplierSchema.statics.checkDuplicateTaxCode = async function (
  taxCode,
  excludeId = null
) {
  if (!taxCode || taxCode.trim() === "") {
    return false; // Không kiểm tra nếu taxCode rỗng (vì sparse index)
  }

  const query = { taxCode: taxCode.trim() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await this.findOne(query).lean();
  return !!existing;
};

export default mongoose.model("Supplier", SupplierSchema);
