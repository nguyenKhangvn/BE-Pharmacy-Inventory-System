import { body, param, query, validationResult } from "express-validator";

// Category validation rules
export const validateCreateCategory = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Category name is required")
    .isLength({ max: 200 })
    .withMessage("Category name must not exceed 200 characters"),

  body("description").optional().trim(),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

export const validateUpdateCategory = [
  body("code")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Category code cannot be empty")
    .isLength({ max: 64 })
    .withMessage("Category code must not exceed 64 characters"),

  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Category name cannot be empty")
    .isLength({ max: 200 })
    .withMessage("Category name must not exceed 200 characters"),

  body("description").optional().trim(),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

// Search validation
export const validateCategorySearch = [
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
  param("id").isMongoId().withMessage("Invalid category ID format"),
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
