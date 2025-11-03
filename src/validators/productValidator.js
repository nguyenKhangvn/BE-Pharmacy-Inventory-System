import Joi from "joi";

/** Reusable rules */
const objectId = Joi.string().length(24).hex();
const sku = Joi.string().trim().max(100);
const name = Joi.string().trim().max(255);
const description = Joi.string().trim().allow("");
const activeIngredient = Joi.string().trim().max(255);
const unit = Joi.string().trim().max(50);
const minimumStock = Joi.number().min(0);
const isActive = Joi.boolean();

/** CREATE: giống express-validator (name + unit bắt buộc) */
export const createProductSchema = Joi.object({
  sku: sku.optional(),
  name: name.required().messages({
    "any.required": "Product name is required",
    "string.empty": "Product name is required",
    "string.max": "Product name must not exceed 255 characters",
  }),
  description: description.optional(),
  activeIngredient: activeIngredient.optional().messages({
    "string.max": "Active ingredient must not exceed 255 characters",
  }),
  unit: unit.required().messages({
    "any.required": "Unit is required",
    "string.empty": "Unit is required",
    "string.max": "Unit must not exceed 50 characters",
  }),
  minimumStock: minimumStock.optional().messages({
    "number.min": "Minimum stock must be a non-negative number",
  }),
  categoryId: objectId.optional(),
  supplierId: objectId.optional(),
  isActive: isActive.optional(),
}).unknown(false);

/** UPDATE: tất cả optional nhưng phải có ÍT NHẤT 1 field */
export const updateProductSchema = Joi.object({
  sku: sku.optional().messages({
    "string.max": "SKU must not exceed 100 characters",
  }),
  name: name.optional().disallow("").messages({
    "string.empty": "Product name cannot be empty",
    "string.max": "Product name must not exceed 255 characters",
  }),
  description: description.optional(),
  activeIngredient: activeIngredient.optional().messages({
    "string.max": "Active ingredient must not exceed 255 characters",
  }),
  unit: unit.optional().disallow("").messages({
    "string.empty": "Unit cannot be empty",
    "string.max": "Unit must not exceed 50 characters",
  }),
  minimumStock: minimumStock.optional().messages({
    "number.min": "Minimum stock must be a non-negative number",
  }),
  categoryId: objectId.optional(),
  supplierId: objectId.optional(),
  isActive: isActive.optional().messages({
    "boolean.base": "isActive must be a boolean",
  }),
})
  .min(1) // bắt buộc có ít nhất 1 field khi update
  .unknown(false);

/** QUERY: tìm kiếm + phân trang (convert 'true'/'false' → boolean) */
export const getProductsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").max(100),
  categoryId: objectId.optional(),
  supplierId: objectId.optional(),
  isActive: Joi.boolean().optional(),
  pagination: Joi.boolean().optional().default(true),
}).unknown(false);

/** PARAM: /:id */
export const productIdParamSchema = Joi.object({
  id: objectId.required().messages({
    "any.required": "Product ID is required",
    "string.length": "Invalid product ID format",
    "string.hex": "Invalid product ID format",
  }),
}).unknown(false);

/** Middleware validate chung */
export const validate =
  (schema, where = "body", { stripUnknown = true } = {}) =>
  (req, res, next) => {
    try {
      const { value, error } = schema.validate(req[where], {
        abortEarly: false, // gom tất cả lỗi
        convert: true, // auto convert (vd: "true" -> true)
        stripUnknown, // loại bỏ field lạ
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: error.details.map((e) => ({
            field: e.path.join("."),
            message: e.message,
            type: e.type,
          })),
        });
      }

      // Chỉ gán lại value nếu không phải query (query là read-only trong Express)
      if (where !== "query") {
        req[where] = value;
      } else {
        // Với query, ta cần copy các giá trị đã được convert vào req.query
        // hoặc lưu vào một property khác
        req.validatedQuery = value;
      }

      next();
    } catch (e) {
      console.error("[Validate] Unexpected error:", e);
      return res.status(500).json({
        success: false,
        message: "Validation middleware error",
        error: e.message,
      });
    }
  };
