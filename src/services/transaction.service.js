import mongoose from "mongoose";
import { TxStatus } from "../models/_shared.js";
import {
  Transaction,
  TransactionDetail,
  InventoryLot,
  Product,
  Supplier,
  Warehouse,
} from "../models/index.js";

function autoLotNumber() {
  // LOT-YYYYMMDD-hhmmss-rand4
  const d = new Date();
  const pad = (n) => `${n}`.padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `LOT-${stamp}-${rand}`;
}

/**
 * Create INBOUND transaction (nhập kho) + update InventoryLot
 * @param {*} payload validated body
 * @param {*} actor {userId}
 */
export async function createInboundTransaction(payload, actor) {
  try {
    // 1) sanity checks FK
    const [wh, sup] = await Promise.all([
      Warehouse.findById(payload.warehouseId),
      Supplier.findById(payload.supplierId),
    ]);
    if (!wh) throw new Error("warehouseId not found");
    if (!sup) throw new Error("supplierId not found");

    // 2) make Transaction header
    const txDoc = await Transaction.create({
      type: "INBOUND",
      status: "COMPLETED",
      referenceCode: undefined, // có thể sinh sau (counter)
      notes: payload.notes || "",
      transactionDate: payload.transactionDate || new Date(),

      userId: actor?.userId || null,
      supplierId: payload.supplierId,
      destinationWarehouseId: payload.warehouseId, // INBOUND uses destinationWarehouseId

      // các field chỉ dùng cho type khác để null
      departmentId: null,
      sourceWarehouseId: null,

      completedAt: new Date(),
    });

    // 3) chi tiết + cập nhật tồn theo lô
    const detailDocs = [];
    for (const row of payload.details) {
      // đảm bảo product tồn tại
      const prod = await Product.findById(row.productId);
      if (!prod) throw new Error(`productId not found: ${row.productId}`);

      // inventory lot: nếu truyền lotNumber+expiryDate trùng => cộng; ngược lại tạo mới
      const lotNumber = row.lotNumber?.trim()
        ? row.lotNumber.trim()
        : autoLotNumber();

      let lot = await InventoryLot.findOne({
        productId: row.productId,
        warehouseId: payload.warehouseId,
        lotNumber,
        ...(row.expiryDate ? { expiryDate: row.expiryDate } : {}),
      });

      if (!lot) {
        lot = new InventoryLot({
          productId: row.productId,
          warehouseId: payload.warehouseId,
          lotNumber,
          expiryDate: row.expiryDate || null,
          quantity: 0,
          unitCost: row.unitPrice ?? 0,
        });
      }

      // cộng số lượng
      lot.quantity += row.quantity;
      // (tuỳ bài toán có cần tính giá bình quân thì cập nhật unitCost ở đây)
      await lot.save();

      // tạo detail
      detailDocs.push({
        transactionId: txDoc._id,
        productId: row.productId,
        inventoryLotId: lot._id,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
      });
    }

    await TransactionDetail.insertMany(detailDocs);

    // (optional) gán referenceCode sau khi có _id/counter
    // txDoc.referenceCode = await nextSequence('TX_IN'); await txDoc.save();

    // trả về header + summary
    return {
      transaction: txDoc,
      details: detailDocs,
      status: TxStatus[1], // COMPLETED
    };
  } catch (err) {
    throw err;
  }
}
