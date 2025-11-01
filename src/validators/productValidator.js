import { body, param, query, validationResult } from "express-validator";

// Product validation rules
export const validateCreateProduct = [
  body("sku")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("SKU must not exceed 100 characters"),

  body("name")
    .trim()
    .notEmpty()
    .withMessage("Product name is required")
    .isLength({ max: 255 })
    .withMessage("Product name must not exceed 255 characters"),

  body("description").optional().trim(),

  body("activeIngredient")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Active ingredient must not exceed 255 characters"),

  body("unit")
    .trim()
    .notEmpty()
    .withMessage("Unit is required")
    .isLength({ max: 50 })
    .withMessage("Unit must not exceed 50 characters"),

  body("minimumStock")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Minimum stock must be a non-negative number"),
];

export const validateUpdateProduct = [
  body("sku")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("SKU must not exceed 100 characters"),

  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Product name cannot be empty")
    .isLength({ max: 255 })
    .withMessage("Product name must not exceed 255 characters"),

  body("description").optional().trim(),

  body("activeIngredient")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Active ingredient must not exceed 255 characters"),

  body("unit")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Unit cannot be empty")
    .isLength({ max: 50 })
    .withMessage("Unit must not exceed 50 characters"),

  body("minimumStock")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Minimum stock must be a non-negative number"),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

// Search validation
export const validateProductSearch = [
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),

  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be true or false"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
];

// ID parameter validation
export const validateObjectId = [
  param("id").isMongoId().withMessage("Invalid product ID format"),
];

// Middleware to check validation results
export const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};
