import mongoose from "mongoose";
import InventoryIssue from "../models/inventoryIssue.model.js";
import InventoryLot from "../models/inventoryLot.model.js";
import Product from "../models/product.model.js";
import Department from "../models/department.model.js";
import Transaction from "../models/transaction.model.js";
import TransactionDetail from "../models/transactionDetail.model.js";
import ApiResponse from "../utils/ApiResponse.js";

class InventoryIssueController {
  // @desc    Create inventory issue (Phiếu xuất kho)
  // @route   POST /api/inventory-issues
  // @access  Private
  static async createInventoryIssue(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Support both 'items' and 'details' for backward compatibility
      const { warehouseId, department, issueDate, notes, items, details } =
        req.body || {};
      
      // Use 'details' if provided, otherwise fall back to 'items'
      const itemsToProcess = details || items;
      
      const userId = req.user?.id;
      const ErrorMsg = InventoryIssue.ErrorMessages;

      // --- Validation ---
      if (!warehouseId) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.WAREHOUSE_REQUIRED, 400);
      }

      if (!department || !department.trim()) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.DEPARTMENT_REQUIRED, 400);
      }

      if (!issueDate) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.ISSUE_DATE_REQUIRED, 400);
      }

      if (!itemsToProcess) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.ITEMS_REQUIRED, 400);
      }

      if (!Array.isArray(itemsToProcess)) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.ITEMS_MUST_BE_ARRAY, 400);
      }

      if (itemsToProcess.length === 0) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.ITEMS_REQUIRED, 400);
      }

      // Validate each item
      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        
        // Support both 'quantity' and 'totalQuantity'
        const qty = item.quantity || item.totalQuantity;
        
        if (!item.productId) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.PRODUCT_ID_REQUIRED} (dòng ${i + 1})`,
            400
          );
        }
        if (!qty) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.QUANTITY_REQUIRED} (dòng ${i + 1})`,
            400
          );
        }
        if (qty <= 0) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.QUANTITY_INVALID} (dòng ${i + 1})`,
            400
          );
        }
        if (item.unitPrice === undefined || item.unitPrice === null) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.UNIT_PRICE_REQUIRED} (dòng ${i + 1})`,
            400
          );
        }
        if (item.unitPrice < 0) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.UNIT_PRICE_INVALID} (dòng ${i + 1})`,
            400
          );
        }
        
        // Normalize quantity field for later processing
        item.quantity = qty;
      }

      // --- Check stock availability ---
      const stockErrors = await InventoryIssue.validateStockAvailability(
        warehouseId,
        itemsToProcess
      );

      if (stockErrors.length > 0) {
        await session.abortTransaction();
        return ApiResponse.error(res, ErrorMsg.INSUFFICIENT_STOCK, 400, stockErrors);
      }

      // --- Process each item with FEFO allocation ---
      const detailsArray = [];

      for (const item of itemsToProcess) {
        const { productId, quantity, unitPrice, lotAllocations: providedLots } = item;

        // Verify product exists
        const product = await Product.findById(productId).lean();
        if (!product) {
          await session.abortTransaction();
          return ApiResponse.error(
            res,
            `${ErrorMsg.PRODUCT_NOT_FOUND}: ${productId}`,
            404
          );
        }

        let lotAllocations = [];
        
        // Case 1: User provided lotAllocations (manual selection)
        if (providedLots && Array.isArray(providedLots) && providedLots.length > 0) {
          // Use provided lot allocations
          for (const allocation of providedLots) {
            const lot = await InventoryLot.findById(allocation.inventoryLotId).session(session);
            
            if (!lot) {
              await session.abortTransaction();
              return ApiResponse.error(
                res,
                `Không tìm thấy lô hàng: ${allocation.inventoryLotId}`,
                404
              );
            }
            
            if (lot.quantity < allocation.quantity) {
              await session.abortTransaction();
              return ApiResponse.error(
                res,
                `Lô "${lot.lotNumber}" không đủ số lượng. Có sẵn: ${lot.quantity}, Yêu cầu: ${allocation.quantity}`,
                400
              );
            }
            
            lotAllocations.push({
              inventoryLotId: lot._id,
              lotNumber: lot.lotNumber,
              expiryDate: lot.expiryDate,
              quantity: allocation.quantity,
              unitCost: lot.unitCost,
            });
            
            // Deduct from lot
            lot.quantity -= allocation.quantity;
            await lot.save({ session });
          }
        } 
        // Case 2: Auto FEFO allocation
        else {
          // Get FEFO suggestion
          const fefoLots = await InventoryLot.fefoSuggestLots(
            productId,
            warehouseId,
            quantity
          );

          if (!fefoLots || fefoLots.length === 0) {
            await session.abortTransaction();
            return ApiResponse.error(
              res,
              `${ErrorMsg.LOT_NOT_FOUND} cho sản phẩm "${product.name}" (${product.productCode})`,
              400
            );
          }

          // Build lot allocations
          let remainingQty = quantity;

          for (const fefo of fefoLots) {
            const lot = await InventoryLot.findById(
              fefo.inventoryLotId
            ).session(session);

            if (!lot) continue;

            const allocQty = Math.min(fefo.pickQty, remainingQty);

            lotAllocations.push({
              inventoryLotId: lot._id,
              lotNumber: lot.lotNumber,
              expiryDate: lot.expiryDate,
              quantity: allocQty,
              unitCost: lot.unitCost,
            });

            // Deduct from lot
            lot.quantity -= allocQty;
            await lot.save({ session });

            remainingQty -= allocQty;
            if (remainingQty <= 0) break;
          }
          
          if (remainingQty > 0) {
            await session.abortTransaction();
            return ApiResponse.error(
              res,
              `${ErrorMsg.INSUFFICIENT_STOCK} cho sản phẩm "${product.name}". Còn thiếu: ${remainingQty} ${product.unit || "đơn vị"}`,
              400
            );
          }
        }

        const lineTotal = quantity * unitPrice;

        detailsArray.push({
          productId,
          lotAllocations,
          totalQuantity: quantity,
          unitPrice,
          lineTotal,
        });
      }

      // --- Create InventoryIssue ---
      // Calculate total amount
      const totalAmount = detailsArray.reduce(
        (sum, detail) => sum + detail.lineTotal,
        0
      );

      // Generate issue code
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");

      // Get count of today's issues for sequential number
      const todayStart = new Date(today.setHours(0, 0, 0, 0));
      const todayEnd = new Date(today.setHours(23, 59, 59, 999));
      const todayIssuesCount = await InventoryIssue.countDocuments({
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }).session(session);

      const sequentialNumber = String(todayIssuesCount + 1).padStart(3, "0");
      const issueCode = `PX-${year}${month}${day}-${sequentialNumber}`;

      // --- Find or Create Department ---
      let departmentDoc = await Department.findOne({ 
        name: department.trim() 
      }).session(session);

      if (!departmentDoc) {
        // Tự động tạo department nếu chưa tồn tại
        const deptCode = department.trim().toUpperCase().replace(/\s+/g, '-');
        departmentDoc = new Department({
          code: `DEPT-${deptCode}-${Date.now()}`,
          name: department.trim(),
          isActive: true,
        });
        await departmentDoc.save({ session });
      }

      const issue = new InventoryIssue({
        issueCode,
        warehouseId,
        department: department.trim(),
        issueDate: new Date(issueDate),
        notes: (notes || "").trim(),
        details: detailsArray,
        totalAmount,
        status: "confirmed",
        createdBy: userId,
        confirmedBy: userId,
        confirmedAt: new Date(),
      });
      await issue.save({ session });

      // --- Create Transaction (OUTBOUND) ---
      const transaction = new Transaction({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: issueCode,
        notes: (notes || "").trim(),
        transactionDate: new Date(issueDate),
        userId: userId,
        sourceWarehouseId: warehouseId,
        departmentId: departmentDoc._id,
        completedAt: new Date(),
      });
      await transaction.save({ session });

      // --- Create TransactionDetails ---
      const transactionDetails = [];
      for (const detail of detailsArray) {
        for (const lotAlloc of detail.lotAllocations) {
          const txDetail = new TransactionDetail({
            transactionId: transaction._id,
            productId: detail.productId,
            inventoryLotId: lotAlloc.inventoryLotId,
            quantity: lotAlloc.quantity,
            unitPrice: detail.unitPrice,
          });
          transactionDetails.push(txDetail);
        }
      }
      await TransactionDetail.insertMany(transactionDetails, { session });

      await session.commitTransaction();

      // --- Response ---
      const created = issue;
      const data = {
        id: String(created._id),
        issueCode: created.issueCode,
        warehouseId: String(created.warehouseId),
        department: created.department,
        issueDate: created.issueDate,
        notes: created.notes,
        details: created.details.map((d) => ({
          productId: String(d.productId),
          totalQuantity: d.totalQuantity,
          unitPrice: d.unitPrice,
          lineTotal: d.lineTotal,
          lotAllocations: d.lotAllocations.map((la) => ({
            inventoryLotId: String(la.inventoryLotId),
            lotNumber: la.lotNumber,
            expiryDate: la.expiryDate,
            quantity: la.quantity,
            unitCost: la.unitCost,
          })),
        })),
        totalAmount: created.totalAmount,
        status: created.status,
        createdBy: String(created.createdBy),
        confirmedBy: String(created.confirmedBy),
        confirmedAt: created.confirmedAt,
        createdAt: created.createdAt,
      };

      return ApiResponse.success(
        res,
        data,
        "Tạo phiếu xuất kho thành công",
        201
      );
    } catch (error) {
      await session.abortTransaction();
      console.error("Create inventory issue error:", error);
      
      // Handle specific errors
      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map((e) => e.message);
        return ApiResponse.error(res, "Lỗi xác thực dữ liệu", 400, errors);
      }
      
      if (error.name === "CastError") {
        return ApiResponse.error(
          res,
          `ID không hợp lệ: ${error.path} = ${error.value}`,
          400
        );
      }

      return ApiResponse.error(
        res,
        "Lỗi server khi tạo phiếu xuất kho. Vui lòng thử lại sau.",
        500
      );
    } finally {
      session.endSession();
    }
  }

  // @desc    Get product suggestions for issue (with stock info)
  // @route   GET /api/inventory-issues/product-suggestions
  // @access  Private
  static async getProductSuggestions(req, res) {
    try {
      const { warehouseId, q } = req.query;
      const ErrorMsg = InventoryIssue.ErrorMessages;

      if (!warehouseId) {
        return ApiResponse.error(res, ErrorMsg.WAREHOUSE_REQUIRED, 400);
      }

      // Build search query
      const query = {};
      if (q && q.trim()) {
        const searchTerm = q.trim();
        const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");
        query.$or = [{ name: regex }, { sku: regex }];
      }

      // Get products
      const products = await Product.find(query)
        .select("_id sku name unit")
        .limit(20)
        .lean();

      // Get stock info for each product
      const suggestions = await Promise.all(
        products.map(async (product) => {
          const stockInfo = await InventoryLot.aggregateStock({
            productId: product._id,
            warehouseId,
          });

          const stock = stockInfo[0] || {
            stockQty: 0,
            nearestExpiry: null,
            stockValue: 0,
          };

          // Get nearest expiry lot for unit price
          const nearestLot = await InventoryLot.findOne({
            productId: product._id,
            warehouseId,
            quantity: { $gt: 0 },
          })
            .sort({ expiryDate: 1, createdAt: 1 })
            .select("unitCost expiryDate")
            .lean();

          return {
            id: String(product._id),
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            availableQty: stock.stockQty,
            unitPrice: nearestLot?.unitCost || 0,
            nearestExpiry: nearestLot?.expiryDate || null,
          };
        })
      );

      return ApiResponse.success(
        res,
        suggestions,
        "Lấy danh sách gợi ý sản phẩm thành công"
      );
    } catch (error) {
      console.error("Get product suggestions error:", error);
      
      if (error.name === "CastError") {
        return ApiResponse.error(
          res,
          `ID kho không hợp lệ: ${error.value}`,
          400
        );
      }

      return ApiResponse.error(
        res,
        "Lỗi server khi lấy gợi ý sản phẩm. Vui lòng thử lại sau.",
        500
      );
    }
  }
}

export default InventoryIssueController;