import mongoose from "mongoose";

const InventoryIssueDetailSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Sản phẩm là bắt buộc"],
    },
    lotAllocations: [
      {
        inventoryLotId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "InventoryLot",
          required: true,
        },
        lotNumber: { type: String, required: true },
        expiryDate: { type: Date },
        quantity: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },
      },
    ],
    totalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const InventoryIssueSchema = new mongoose.Schema(
  {
    issueCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Kho xuất là bắt buộc"],
    },
    department: {
      type: String,
      required: [true, "Khoa/Phòng nhận là bắt buộc"],
      trim: true,
      maxlength: 200,
    },
    issueDate: {
      type: Date,
      required: [true, "Ngày xuất là bắt buộc"],
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    details: {
      type: [InventoryIssueDetailSchema],
      required: true,
      validate: {
        validator: function (arr) {
          return arr && arr.length > 0;
        },
        message: "Phải có ít nhất một dòng thuốc",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: {
        values: ["draft", "confirmed", "cancelled"],
        message: "Trạng thái không hợp lệ",
      },
      default: "confirmed",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    confirmedAt: {
      type: Date,
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

// Indexes
InventoryIssueSchema.index({ issueCode: 1 });
InventoryIssueSchema.index({ warehouseId: 1, issueDate: -1 });
InventoryIssueSchema.index({ department: 1 });
InventoryIssueSchema.index({ status: 1 });
InventoryIssueSchema.index({ createdAt: -1 });

// Auto-generate issueCode
InventoryIssueSchema.pre("save", async function (next) {
  if (this.isNew && !this.issueCode) {
    try {
      const lastIssue = await this.constructor
        .findOne({}, { issueCode: 1 })
        .sort({ createdAt: -1 })
        .lean();

      if (lastIssue && lastIssue.issueCode) {
        const match = lastIssue.issueCode.match(/\d+$/);
        if (match) {
          const lastNumber = parseInt(match[0], 10);
          const newNumber = lastNumber + 1;
          this.issueCode = `IX${String(newNumber).padStart(6, "0")}`;
        } else {
          this.issueCode = "IX000001";
        }
      } else {
        this.issueCode = "IX000001";
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Calculate totalAmount before save
InventoryIssueSchema.pre("save", function (next) {
  if (this.details && this.details.length > 0) {
    this.totalAmount = this.details.reduce(
      (sum, item) => sum + (item.lineTotal || 0),
      0
    );
  }
  next();
});

// Static method: Validate stock availability
InventoryIssueSchema.statics.validateStockAvailability = async function (
  warehouseId,
  items
) {
  const InventoryLot = mongoose.model("InventoryLot");
  const Product = mongoose.model("Product");
  const validationErrors = [];

  for (const item of items) {
    const { productId, quantity } = item;

    // Get product info for better error message
    const product = await Product.findById(productId).lean();
    const productName = product?.name || productId;

    // Aggregate total stock for this product in warehouse
    const stockInfo = await InventoryLot.aggregateStock({
      productId,
      warehouseId,
    });

    const availableQty = stockInfo[0]?.stockQty || 0;

    if (quantity > availableQty) {
      validationErrors.push({
        productId,
        productName,
        requested: quantity,
        available: availableQty,
        shortage: quantity - availableQty,
        message: `Sản phẩm "${productName}" không đủ tồn kho. Yêu cầu: ${quantity}, Có sẵn: ${availableQty}, Thiếu: ${quantity - availableQty}`,
      });
    }
  }

  return validationErrors;
};

// Static method: Error messages
InventoryIssueSchema.statics.ErrorMessages = {
  WAREHOUSE_REQUIRED: "Kho xuất là bắt buộc",
  DEPARTMENT_REQUIRED: "Khoa/Phòng nhận là bắt buộc",
  ISSUE_DATE_REQUIRED: "Ngày xuất là bắt buộc",
  ITEMS_REQUIRED: "Danh sách sản phẩm không được để trống",
  ITEMS_MUST_BE_ARRAY: "Danh sách sản phẩm phải là một mảng",
  PRODUCT_ID_REQUIRED: "Mã sản phẩm là bắt buộc",
  QUANTITY_REQUIRED: "Số lượng là bắt buộc",
  QUANTITY_INVALID: "Số lượng phải lớn hơn 0",
  UNIT_PRICE_REQUIRED: "Đơn giá là bắt buộc",
  UNIT_PRICE_INVALID: "Đơn giá phải lớn hơn hoặc bằng 0",
  INSUFFICIENT_STOCK: "Không đủ hàng tồn kho",
  LOT_NOT_FOUND: "Không tìm thấy lô hàng phù hợp",
  PRODUCT_NOT_FOUND: "Sản phẩm không tồn tại",
  WAREHOUSE_NOT_FOUND: "Kho không tồn tại",
  ISSUE_NOT_FOUND: "Phiếu xuất kho không tồn tại",
  CANNOT_CANCEL_CONFIRMED: "Không thể hủy phiếu đã xác nhận",
  ALREADY_CANCELLED: "Phiếu đã bị hủy trước đó",
};

export default mongoose.model("InventoryIssue", InventoryIssueSchema);