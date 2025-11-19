import ApiResponse from "../utils/ApiResponse.js";
import { createInboundTransactionSchema } from "../validators/transaction.validator.js";
import { createInboundTransaction } from "../services/transaction.service.js";
import {
  getInboundTransactionById,
  getOutboundTransactions,
  getOutboundTransactionById,
} from "../services/transaction.query.js";

class TransactionController {
  /**
   * POST /api/transactions  (INBOUND – nhập kho)
   * Body:
   * {
   *   type: "INBOUND",
   *   warehouseId, supplierId, notes?, transactionDate?,
   *   details: [{ productId, quantity, unitPrice, lotNumber?, expiryDate? }, ...]
   * }
   */
  static async create(req, res) {
    try {
      // Validate
      const { error, value } = createInboundTransactionSchema.validate(
        req.body,
        {
          abortEarly: false,
          stripUnknown: true,
        }
      );
      if (error) {
        return ApiResponse.error(res, "Validation failed", 400, {
          details: error.details.map((d) => d.message),
        });
      }

      // actor lấy từ auth middleware (req.user)
      const actor = { userId: req.user?.id || req.user?._id || null };

      // Only INBOUND in this API version
      if (value.type !== "INBOUND") {
        return ApiResponse.error(
          res,
          "Only INBOUND is supported in this endpoint",
          400
        );
      }

      const result = await createInboundTransaction(value, actor);

      return ApiResponse.success(
        res,
        {
          transaction: result.transaction,
          details: result.details,
        },
        "Transaction (INBOUND) created and inventory updated",
        201
      );
    } catch (err) {
      console.error("Create transaction error:", err);
      const msg = err?.message || "Server error";
      // Handle validation and not found errors
      if (msg.includes("not found") || msg.includes("No warehouse found")) {
        return ApiResponse.error(res, msg, 400);
      }
      return ApiResponse.error(res, "Server error", 500);
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query; // type=INBOUND or type=OUTBOUND

      let data;
      if (type === "OUTBOUND") {
        data = await getOutboundTransactionById(id);
      } else {
        // Default to INBOUND for backward compatibility
        data = await getInboundTransactionById(id);
      }

      return ApiResponse.success(
        res,
        data,
        `${type || "INBOUND"} transaction retrieved successfully`
      );
    } catch (err) {
      const code = err.statusCode || 500;
      const msg = code === 500 ? "Server error" : err.message;
      return ApiResponse.error(res, msg, code);
    }
  }

  /**
   * GET /api/transactions?type=OUTBOUND&search=&fromDate=&toDate=&page=&limit=
   * Get list of OUTBOUND transactions
   */
  static async getList(req, res) {
    try {
      const { type, search, fromDate, toDate, page, limit } = req.query;

      if (type !== "OUTBOUND") {
        return ApiResponse.error(
          res,
          "Only type=OUTBOUND is supported for listing",
          400
        );
      }

      const filters = {
        search,
        fromDate,
        toDate,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
      };

      const result = await getOutboundTransactions(filters);

      return ApiResponse.success(
        res,
        result,
        "OUTBOUND transactions retrieved successfully"
      );
    } catch (err) {
      console.error("Get transaction list error:", err);
      const msg = err?.message || "Server error";
      return ApiResponse.error(res, msg, 500);
    }
  }
}

export default TransactionController;
