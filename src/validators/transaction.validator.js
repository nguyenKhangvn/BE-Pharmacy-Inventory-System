import Joi from "joi";

export const createInboundTransactionSchema = Joi.object({
  type: Joi.string().valid("INBOUND").required(),
  transactionDate: Joi.date().optional(),
  notes: Joi.string().allow("", null),

  warehouseId: Joi.string().required(), // nơi nhập về
  supplierId: Joi.string().required(),

  // Người lập phiếu -> lấy từ req.user trong middleware auth
  userId: Joi.string().optional(),

  details: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        unitPrice: Joi.number().min(0).required(),

        // Thông tin lô - nếu không truyền lotNumber thì tự sinh
        lotNumber: Joi.string().allow("", null),
        expiryDate: Joi.date().optional(),
      })
    )
    .min(1)
    .required(),
});
