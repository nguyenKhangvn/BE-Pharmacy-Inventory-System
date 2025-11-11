import jwt from "jsonwebtoken";

/**
 * Generate a test JWT token
 * @param {Object} payload - Token payload
 * @returns {String} JWT token
 */
export const generateTestToken = (payload = {}) => {
  const defaultPayload = {
    id: "507f1f77bcf86cd799439011",
    email: "test@example.com",
    role: "ADMIN",
    organizationId: "507f1f77bcf86cd799439012",
    ...payload,
  };

  return jwt.sign(defaultPayload, process.env.JWT_SECRET || "test-secret", {
    expiresIn: "1d",
  });
};

/**
 * Create sample category data
 * @param {Object} overrides - Override default values
 * @returns {Object} Category data
 */
export const createCategoryData = (overrides = {}) => {
  return {
    code: "CAT001",
    name: "Test Category",
    description: "Test category description",
    isActive: true,
    ...overrides,
  };
};

/**
 * Create sample product data
 * @param {Object} overrides - Override default values
 * @returns {Object} Product data
 */
export const createProductData = (overrides = {}) => {
  return {
    sku: "SKU001",
    name: "Test Product",
    description: "Test product description",
    activeIngredient: "Test ingredient",
    unit: "viên",
    minimumStock: 10,
    isActive: true,
    ...overrides,
  };
};
