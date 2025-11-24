import Joi from "joi";

export const createInboundTransactionSchema = Joi.object({
  type: Joi.string().valid("INBOUND").required(),
  warehouseId: Joi.string().optional(),
  supplierId: Joi.string().required(),
  notes: Joi.string().allow("").optional(),
  transactionDate: Joi.date().optional(),
  details: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().optional(),
        productName: Joi.string()
          .when("productId", {
            is: Joi.exist(),
            then: Joi.optional(),
            otherwise: Joi.required(), // bắt buộc khi không có productId
          })
          .messages({
            "any.required":
              "Product name is required if productId not provided",
          }),
        sku: Joi.string().optional(),
        unit: Joi.string().optional(),
        description: Joi.string().allow("").optional(),
        quantity: Joi.number().min(1).required(),
        categoryId: Joi.string().optional(),
        unitPrice: Joi.number().min(0).required(),
        lotNumber: Joi.string().allow("").optional(),
        expiryDate: Joi.date().optional(),
      })
    )
    .min(1)
    .required(),
});
