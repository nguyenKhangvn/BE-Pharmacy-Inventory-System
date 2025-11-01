import mongoose from "mongoose";

const InventoryLotSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    lotNumber: { type: String, required: true, trim: true, maxlength: 100 },
    expiryDate: { type: Date },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unitCost: { type: Number, required: true, min: 0, default: 0 }, // giá vốn theo lô
  },
  { timestamps: true, versionKey: false }
);

InventoryLotSchema.index(
  { productId: 1, warehouseId: 1, lotNumber: 1 },
  { unique: true }
);
InventoryLotSchema.index({ expiryDate: 1 });
InventoryLotSchema.index({ productId: 1, warehouseId: 1 });

// Tổng tồn + hạn gần nhất + giá trị tồn theo (product, warehouse)
InventoryLotSchema.statics.aggregateStock = function (filter = {}) {
  const $match = {
    ...(filter.productId
      ? { productId: new mongoose.Types.ObjectId(filter.productId) }
      : {}),
    ...(filter.warehouseId
      ? { warehouseId: new mongoose.Types.ObjectId(filter.warehouseId) }
      : {}),
  };
  return this.aggregate([
    { $match },
    {
      $group: {
        _id: { productId: "$productId", warehouseId: "$warehouseId" },
        stockQty: { $sum: "$quantity" },
        nearestExpiry: {
          $min: { $cond: [{ $gt: ["$quantity", 0] }, "$expiryDate", null] },
        },
        stockValue: { $sum: { $multiply: ["$quantity", "$unitCost"] } },
      },
    },
    {
      $project: {
        _id: 0,
        productId: "$_id.productId",
        warehouseId: "$_id.warehouseId",
        stockQty: 1,
        nearestExpiry: 1,
        stockValue: 1,
      },
    },
  ]);
};

// FEFO: gợi ý lô theo hạn gần nhất, trả về [{inventoryLotId, pickQty}]
InventoryLotSchema.statics.fefoSuggestLots = function (
  productId,
  warehouseId,
  requiredQty
) {
  const need = Number(requiredQty);
  if (!productId || !warehouseId || !(need > 0))
    throw new Error("Invalid params for FEFO");

  return this.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        warehouseId: new mongoose.Types.ObjectId(warehouseId),
        quantity: { $gt: 0 },
      },
    },
    {
      $addFields: {
        _expNull: { $cond: [{ $eq: ["$expiryDate", null] }, 1, 0] },
      },
    },
    { $sort: { _expNull: 1, expiryDate: 1, createdAt: 1, _id: 1 } },
    {
      $setWindowFields: {
        sortBy: { _expNull: 1, expiryDate: 1, createdAt: 1, _id: 1 },
        output: {
          cumQty: {
            $sum: "$quantity",
            window: { documents: ["unbounded", "current"] },
          },
        },
      },
    },
    {
      $addFields: {
        pickQty: {
          $min: [
            "$quantity",
            {
              $max: [
                { $subtract: [need, { $subtract: ["$cumQty", "$quantity"] }] },
                0,
              ],
            },
          ],
        },
      },
    },
    { $match: { pickQty: { $gt: 0 } } },
    { $project: { _id: 0, inventoryLotId: "$_id", pickQty: 1 } },
  ]);
};

// Các lô sắp hết hạn trong X ngày (default 30)
InventoryLotSchema.statics.expiringSoon = function (days = 30) {
  return this.aggregate([
    {
      $match: {
        expiryDate: {
          $ne: null,
          $lte: { $dateAdd: { startDate: "$$NOW", unit: "day", amount: days } },
        },
        quantity: { $gt: 0 },
      },
    },
    {
      $addFields: {
        daysLeft: {
          $dateDiff: {
            startDate: "$$NOW",
            endDate: "$expiryDate",
            unit: "day",
          },
        },
      },
    },
    {
      $project: {
        productId: 1,
        warehouseId: 1,
        lotNumber: 1,
        expiryDate: 1,
        quantity: 1,
        daysLeft: 1,
      },
    },
  ]);
};

export default mongoose.model("InventoryLot", InventoryLotSchema);
