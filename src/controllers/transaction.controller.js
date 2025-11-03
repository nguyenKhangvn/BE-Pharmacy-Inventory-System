import ApiResponse from "../utils/ApiResponse.js";
import { createInboundTransactionSchema } from "../validators/transaction.validator.js";
import { createInboundTransaction } from "../services/transaction.service.js";

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
      if (msg.includes("not found")) return ApiResponse.error(res, msg, 400);
      return ApiResponse.error(res, "Server error", 500);
    }
  }
}

export default TransactionController;
