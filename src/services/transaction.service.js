import mongoose from "mongoose";
import { TxStatus } from "../models/_shared.js";
import {
  Transaction,
  TransactionDetail,
  InventoryLot,
  Product,
  Supplier,
  Warehouse,
  ProductSupplier,
} from "../models/index.js";

function autoLotNumber() {
  const d = new Date();
  const pad = (n) => `${n}`.padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `LOT-${stamp}-${rand}`;
}

/**
 * Create INBOUND transaction (nhập kho) + update InventoryLot + Product
 * @param {*} payload validated body
 * @param {*} actor {userId}
 */
export async function createInboundTransaction(payload, actor) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let wh = null;
    if (payload.warehouseId) {
      wh = await Warehouse.findById(payload.warehouseId).session(session);
    } else {
      wh = await Warehouse.findOne().session(session);
    }

    if (!wh)
      throw new Error("No warehouse found (system must have at least one)");

    const sup = await Supplier.findById(payload.supplierId).session(session);
    if (!sup) throw new Error("supplierId not found");

    const txDoc = await Transaction.create(
      [
        {
          type: "INBOUND",
          status: "COMPLETED",
          referenceCode: undefined,
          notes: payload.notes || "",
          transactionDate: payload.transactionDate || new Date(),

          userId: actor?.userId || null,
          supplierId: payload.supplierId,
          destinationWarehouseId: wh._id, // luôn dùng kho duy nhất

          departmentId: null,
          sourceWarehouseId: null,
          completedAt: new Date(),
        },
      ],
      { session }
    );

    const tx = txDoc[0];
    const detailDocs = [];

    for (const row of payload.details) {
      let prod = null;

      // Nếu có productId thì tìm
      if (row.productId) {
        prod = await Product.findById(row.productId).session(session);
      }

      // Nếu không có, tạo mới Product
      if (!prod) {
        if (!row.productName) {
          throw new Error(
            "Missing productName for a new product (productId not found)"
          );
        }

        prod = await Product.create(
          [
            {
              name: row.productName,
              sku: row.sku || `SKU-${Date.now()}`,
              unit: row.unit || "unit",
              description: (row.description && row.description.trim()) || "",
              currentStock: row.quantity,
              categoryId: row.categoryId || null,
              isActive: true,
            },
          ],
          { session }
        );

        prod = prod[0];
      } else {
        // Nếu có rồi: cộng thêm tồn kho và cập nhật description nếu có
        prod.currentStock = (prod.currentStock ?? 0) + row.quantity;
        
        // Cập nhật description nếu được cung cấp
        if (row.description && row.description.trim()) {
          prod.description = row.description.trim();
        }
        
        await prod.save({ session });
      }

      const lotNumber = row.lotNumber?.trim()
        ? row.lotNumber.trim()
        : autoLotNumber();

      let lot = await InventoryLot.findOne({
        productId: prod._id,
        warehouseId: wh._id,
        lotNumber,
        ...(row.expiryDate ? { expiryDate: row.expiryDate } : {}),
      }).session(session);

      if (!lot) {
        lot = new InventoryLot({
          productId: prod._id,
          warehouseId: wh._id,
          lotNumber,
          expiryDate: row.expiryDate || null,
          quantity: 0,
          unitCost: row.unitPrice ?? 0,
        });
      }

      lot.quantity += row.quantity;
      await lot.save({ session });

      // Lưu ProductSupplier nếu chưa tồn tại
      const existingPS = await ProductSupplier.findOne({
        productId: prod._id,
        supplierId: payload.supplierId,
      }).session(session);

      if (!existingPS) {
        await ProductSupplier.create(
          [
            {
              productId: prod._id,
              supplierId: payload.supplierId,
              isPrimary: false,
            },
          ],
          { session }
        );
      }

      detailDocs.push({
        transactionId: tx._id,
        productId: prod._id,
        inventoryLotId: lot._id,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
      });
    }

    await TransactionDetail.insertMany(detailDocs, { session });

    await session.commitTransaction();
    session.endSession();

    return {
      transaction: tx,
      details: detailDocs,
      status: TxStatus[1], // COMPLETED
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}
