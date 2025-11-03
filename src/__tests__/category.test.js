import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import { connect, closeDatabase, clearDatabase } from "./setup/db.js";
import {
  generateTestToken,
  createCategoryData,
  createProductData,
} from "./setup/helpers.js";
import categoryRoutes from "../routes/category.route.js";
import { Category, Product } from "../models/index.js";

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use("/api/categories", categoryRoutes);

describe("Category API Tests", () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    // Set JWT_SECRET for testing environment
    process.env.JWT_SECRET = "test-secret";

    await connect();

    // Generate tokens for different roles
    adminToken = generateTestToken({ role: "admin" });
    userToken = generateTestToken({ role: "user" });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe("POST /api/categories", () => {
    it("should create a new category successfully", async () => {
      const categoryData = createCategoryData();

      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(categoryData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Category created successfully");
      expect(response.body.data).toHaveProperty("_id");
      expect(response.body.data.name).toBe(categoryData.name);
      expect(response.body.data.code).toBe(categoryData.code);
      expect(response.body.data.productCount).toBe(0);
    });

    it("should fail to create category without authentication", async () => {
      const categoryData = createCategoryData();

      const response = await request(app)
        .post("/api/categories")
        .send(categoryData)
        .expect(401);

      expect(response.body.message).toBe("No token, authorization denied");
    });

    it("should fail to create category with user role (only admin allowed)", async () => {
      const categoryData = createCategoryData();

      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${userToken}`)
        .send(categoryData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Access denied. Insufficient permissions."
      );
    });

    it("should fail to create category with duplicate name", async () => {
      const categoryData = createCategoryData();

      // Create first category
      await Category.create(categoryData);

      // Try to create duplicate
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(createCategoryData({ code: "CAT002" }))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Category with this name already exists"
      );
    });

    it("should fail to create category with duplicate code", async () => {
      const categoryData = createCategoryData();

      // Create first category
      await Category.create(categoryData);

      // Try to create duplicate
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(createCategoryData({ name: "Different Name" }))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Category with this code already exists"
      );
    });

    it("should fail validation with missing required fields", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation failed");
      expect(response.body.errors).toBeDefined();
    });

    it("should fail validation with invalid data types", async () => {
      const response = await request(app)
        .post("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          code: "CAT001",
          name: "Test Category",
          isActive: "not-a-boolean",
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation failed");
    });
  });

  describe("GET /api/categories", () => {
    it("should get all categories with pagination", async () => {
      // Create test categories
      await Category.create([
        createCategoryData({ code: "CAT001", name: "Category 1" }),
        createCategoryData({ code: "CAT002", name: "Category 2" }),
        createCategoryData({ code: "CAT003", name: "Category 3" }),
      ]);

      const response = await request(app)
        .get("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        pages: 2,
      });
    });

    it("should search categories by name", async () => {
      await Category.create([
        createCategoryData({ code: "CAT001", name: "Antibiotic" }),
        createCategoryData({ code: "CAT002", name: "Pain Relief" }),
        createCategoryData({ code: "CAT003", name: "Antiseptic" }),
      ]);

      const response = await request(app)
        .get("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ search: "Anti" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every((cat) =>
          cat.name.toLowerCase().includes("anti")
        )
      ).toBe(true);
    });

    it("should filter categories by isActive status", async () => {
      await Category.create([
        createCategoryData({
          code: "CAT001",
          name: "Active Category",
          isActive: true,
        }),
        createCategoryData({
          code: "CAT002",
          name: "Inactive Category",
          isActive: false,
        }),
      ]);

      const response = await request(app)
        .get("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ isActive: "true" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].isActive).toBe(true);
    });

    it("should include product count in response", async () => {
      const category = await Category.create(createCategoryData());

      // Create products associated with category
      await Product.create([
        createProductData({ sku: "SKU001", categoryId: category._id }),
        createProductData({ sku: "SKU002", categoryId: category._id }),
      ]);

      const response = await request(app)
        .get("/api/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].productCount).toBe(2);
    });

    it("should fail without authentication", async () => {
      await request(app).get("/api/categories").expect(401);
    });
  });

  describe("GET /api/categories/non-pagination", () => {
    it("should get all categories without pagination", async () => {
      // Create multiple categories
      await Category.create([
        createCategoryData({ code: "CAT001", name: "Category 1" }),
        createCategoryData({ code: "CAT002", name: "Category 2" }),
        createCategoryData({ code: "CAT003", name: "Category 3" }),
        createCategoryData({ code: "CAT004", name: "Category 4" }),
        createCategoryData({ code: "CAT005", name: "Category 5" }),
      ]);

      const response = await request(app)
        .get("/api/categories/non-pagination")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination).toBeUndefined();
    });

    it("should return categories sorted by name", async () => {
      await Category.create([
        createCategoryData({ code: "CAT001", name: "Zinc" }),
        createCategoryData({ code: "CAT002", name: "Aspirin" }),
        createCategoryData({ code: "CAT003", name: "Bandage" }),
      ]);

      const response = await request(app)
        .get("/api/categories/non-pagination")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data[0].name).toBe("Aspirin");
      expect(response.body.data[1].name).toBe("Bandage");
      expect(response.body.data[2].name).toBe("Zinc");
    });

    it("should filter by isActive status", async () => {
      await Category.create([
        createCategoryData({
          code: "CAT001",
          name: "Active 1",
          isActive: true,
        }),
        createCategoryData({
          code: "CAT002",
          name: "Inactive 1",
          isActive: false,
        }),
        createCategoryData({
          code: "CAT003",
          name: "Active 2",
          isActive: true,
        }),
      ]);

      const response = await request(app)
        .get("/api/categories/non-pagination")
        .set("Authorization", `Bearer ${adminToken}`)
        .query({ isActive: "true" })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every((cat) => cat.isActive)).toBe(true);
    });
  });

  describe("GET /api/categories/:id", () => {
    it("should get category by ID", async () => {
      const category = await Category.create(createCategoryData());

      const response = await request(app)
        .get(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBe(category._id.toString());
      expect(response.body.data.name).toBe(category.name);
      expect(response.body.data.productCount).toBe(0);
    });

    it("should include product count", async () => {
      const category = await Category.create(createCategoryData());

      await Product.create([
        createProductData({ sku: "SKU001", categoryId: category._id }),
        createProductData({ sku: "SKU002", categoryId: category._id }),
        createProductData({ sku: "SKU003", categoryId: category._id }),
      ]);

      const response = await request(app)
        .get(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.productCount).toBe(3);
    });

    it("should return 404 for non-existent category", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/categories/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Category not found");
    });

    it("should return 400 for invalid ID format", async () => {
      const response = await request(app)
        .get("/api/categories/invalid-id")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Validation failed");
    });
  });

  describe("PUT /api/categories/:id", () => {
    it("should update category successfully", async () => {
      const category = await Category.create(createCategoryData());

      const updateData = {
        name: "Updated Category Name",
        description: "Updated description",
      };

      const response = await request(app)
        .put(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
    });

    it("should fail to update with user role (only admin allowed)", async () => {
      const category = await Category.create(createCategoryData());

      const response = await request(app)
        .put(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ name: "Updated Name" })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Access denied. Insufficient permissions."
      );
    });

    it("should fail to update with duplicate name", async () => {
      const category1 = await Category.create(
        createCategoryData({ code: "CAT001", name: "Category 1" })
      );
      await Category.create(
        createCategoryData({ code: "CAT002", name: "Category 2" })
      );

      const response = await request(app)
        .put(`/api/categories/${category1._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Category 2" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Category with this name already exists"
      );
    });

    it("should fail to update with duplicate code", async () => {
      const category1 = await Category.create(
        createCategoryData({ code: "CAT001", name: "Category 1" })
      );
      await Category.create(
        createCategoryData({ code: "CAT002", name: "Category 2" })
      );

      const response = await request(app)
        .put(`/api/categories/${category1._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "CAT002" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Category with this code already exists"
      );
    });

    it("should return 404 for non-existent category", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/api/categories/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Updated Name" })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Category not found");
    });
  });

  describe("DELETE /api/categories/:id", () => {
    it("should delete category successfully when no products associated", async () => {
      const category = await Category.create(createCategoryData());

      const response = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Category deleted successfully");

      // Verify category is deleted
      const deletedCategory = await Category.findById(category._id);
      expect(deletedCategory).toBeNull();
    });

    it("should fail to delete category with associated products", async () => {
      const category = await Category.create(createCategoryData());

      // Create products associated with category
      await Product.create([
        createProductData({ sku: "SKU001", categoryId: category._id }),
        createProductData({ sku: "SKU002", categoryId: category._id }),
      ]);

      const response = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Cannot delete category");
      expect(response.body.message).toContain("2 product(s)");

      // Verify category still exists
      const existingCategory = await Category.findById(category._id);
      expect(existingCategory).not.toBeNull();
    });

    it("should fail to delete with user role (only admin allowed)", async () => {
      const category = await Category.create(createCategoryData());

      const response = await request(app)
        .delete(`/api/categories/${category._id}`)
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(
        "Access denied. Insufficient permissions."
      );
    });

    it("should return 404 for non-existent category", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/categories/${fakeId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Category not found");
    });

    it("should fail without authentication", async () => {
      const category = await Category.create(createCategoryData());

      await request(app).delete(`/api/categories/${category._id}`).expect(401);
    });
  });
});
