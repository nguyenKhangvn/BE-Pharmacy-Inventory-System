import jwt from "jsonwebtoken";
import mongoose from "mongoose";

/**
 * Create a test user in database
 * @param {Object} overrides - Override default values
 * @returns {Promise<Object>} Created user
 */
export const createTestUser = async (overrides = {}) => {
  const User = mongoose.model("User");
  const userData = {
    username: "testuser",
    fullName: "Test User",
    email: "test@example.com",
    phone: "0123456789",
    password: "password123",
    role: "admin",
    status: "active",
    ...overrides,
  };

  const user = await User.create(userData);
  return user;
};

/**
 * Generate a test JWT token for a user
 * @param {Object} user - User object from database
 * @returns {String} JWT token
 */
export const generateTestToken = (user) => {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET || "test-secret", {
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
