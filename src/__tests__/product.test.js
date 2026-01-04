// __tests__/product.test.js
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
  createTestUser,
  createCategoryData,
  createProductData,
} from "./setup/helpers.js";
import productRoutes from "../routes/product.route.js";
import { Category, Product } from "../models/index.js";

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use("/api/products", productRoutes);

describe("Product API Tests", () => {
  let authToken;
  let userToken;
  let adminUser;
  let normalUser;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    await connect();

    // Create test users in database
    adminUser = await createTestUser({
      username: "adminuser",
      email: "admin@example.com",
      role: "admin",
    });
    normalUser = await createTestUser({
      username: "normaluser",
      email: "user@example.com",
      role: "user",
    });

    authToken = generateTestToken(adminUser);
    userToken = generateTestToken(normalUser);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe("GET /api/products (pagination)", () => {
    it("should get products with pagination defaults (page=1, limit=10)", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({
          sku: "SKU001",
          name: "Alpha",
          categoryId: cat._id,
        }),
        createProductData({ sku: "SKU002", name: "Beta", categoryId: cat._id }),
        createProductData({
          sku: "SKU003",
          name: "Gamma",
          categoryId: cat._id,
        }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 3,
        pages: 1,
      });
      // category projection gọn
      expect(res.body.data[0]).toHaveProperty("category");
    });

    it("should honor custom page & limit", async () => {
      const cat = await Category.create(createCategoryData({ code: "CAT002" }));

      await Product.create([
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat._id }),
        createProductData({ sku: "SKU002", name: "P2", categoryId: cat._id }),
        createProductData({ sku: "SKU003", name: "P3", categoryId: cat._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ page: 2, limit: 2 })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        pages: 2,
      });
    });

    it("should search by name/sku", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({
          sku: "PARA-001",
          name: "Paracetamol 500mg",
          categoryId: cat._id,
        }),
        createProductData({
          sku: "IBU-002",
          name: "Ibuprofen",
          categoryId: cat._id,
        }),
        createProductData({
          sku: "VITC-003",
          name: "Vitamin C",
          categoryId: cat._id,
        }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ search: "para" })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].sku).toBe("PARA-001");
    });

    it("should filter by isActive=true", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({
          sku: "SKU001",
          name: "Active A",
          isActive: true,
          categoryId: cat._id,
        }),
        createProductData({
          sku: "SKU002",
          name: "Inactive B",
          isActive: false,
          categoryId: cat._id,
        }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ isActive: true }) // Joi convert boolean
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].isActive).toBe(true);
    });

    it("should filter by categoryId", async () => {
      const cat1 = await Category.create(
        createCategoryData({ code: "CAT001", name: "Cat 1" })
      );
      const cat2 = await Category.create(
        createCategoryData({ code: "CAT002", name: "Cat 2" })
      );

      await Product.create([
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat1._id }),
        createProductData({ sku: "SKU002", name: "P2", categoryId: cat2._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ categoryId: cat2._id.toString() })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].category?._id).toBe(cat2._id.toString());
    });

    it("should filter by supplierId and compute suppliersCount", async () => {
      const cat = await Category.create(createCategoryData());
      const p1 = await Product.create(
        createProductData({
          sku: "SKU001",
          name: "WithSupplier",
          categoryId: cat._id,
        })
      );
      const p2 = await Product.create(
        createProductData({
          sku: "SKU002",
          name: "NoSupplier",
          categoryId: cat._id,
        })
      );

      const supplierId = new mongoose.Types.ObjectId();
      const otherSupplier = new mongoose.Types.ObjectId();

      // Tạo quan hệ trong collection productsuppliers
      const psCol = mongoose.connection.db.collection("productsuppliers");
      await psCol.insertMany([
        { productId: p1._id, supplierId, createdAt: new Date() },
        { productId: p1._id, supplierId: otherSupplier, createdAt: new Date() }, // p1 có 2 bản ghi (để count > 0)
        { productId: p2._id, supplierId: otherSupplier, createdAt: new Date() },
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ supplierId: supplierId.toString() })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Chỉ p1 match supplierId filter
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0]._id).toBe(p1._id.toString());
      expect(res.body.data[0].suppliersCount).toBeGreaterThan(0);
    });

    it("should fail validation when page < 1", async () => {
      const res = await request(app)
        .get("/api/products?page=0")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Validation failed/i);
    });

    it("should fail without authentication", async () => {
      await request(app).get("/api/products").expect(401);
    });
  });

  describe("GET /api/products (non-pagination)", () => {
    it("should return all products when pagination=false and sorted by name asc", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({ sku: "SKU001", name: "Zeta", categoryId: cat._id }),
        createProductData({
          sku: "SKU002",
          name: "Alpha",
          categoryId: cat._id,
        }),
        createProductData({ sku: "SKU003", name: "Beta", categoryId: cat._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ pagination: false })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.pagination).toBeUndefined();
      expect(res.body.data.length).toBe(3);
      const names = res.body.data.map((x) => x.name);
      expect(names).toEqual(["Alpha", "Beta", "Zeta"]); // sort name: 1
    });
  });

  describe("GET /api/products/:id", () => {
    it("should get product by ID with suppliersCount", async () => {
      const cat = await Category.create(createCategoryData());
      const product = await Product.create(
        createProductData({
          sku: "SKU999",
          name: "Detail X",
          categoryId: cat._id,
        })
      );

      // Thêm 3 quan hệ supplier cho product
      const psCol = mongoose.connection.db.collection("productsuppliers");
      await psCol.insertMany([
        {
          productId: product._id,
          supplierId: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        },
        {
          productId: product._id,
          supplierId: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        },
        {
          productId: product._id,
          supplierId: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(product._id.toString());
      expect(res.body.data.category?._id).toBe(cat._id.toString());
      expect(res.body.data.suppliersCount).toBe(3);
      // giữ nguyên các field chi tiết
      expect(res.body.data).toHaveProperty("description");
      expect(res.body.data).toHaveProperty("activeIngredient");
    });

    it("should return 404 for non-existent product", async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Product not found/i);
    });

    it("should return 400 for invalid ObjectId", async () => {
      const res = await request(app)
        .get("/api/products/not-an-objectid")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Validation failed/i);
    });

    it("should fail without authentication", async () => {
      const cat = await Category.create(createCategoryData());
      const product = await Product.create(
        createProductData({
          sku: "SKU123",
          name: "NoAuth",
          categoryId: cat._id,
        })
      );

      await request(app).get(`/api/products/${product._id}`).expect(401);
    });
  });

  describe("GET /api/products - Additional Edge Cases", () => {
    it("should return empty array when no products exist", async () => {
      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("should handle search with special characters", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({
          sku: "TEST-001",
          name: "Product (Special)",
          categoryId: cat._id,
        }),
        createProductData({
          sku: "TEST-002",
          name: "Product & Co.",
          categoryId: cat._id,
        }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ search: "(Special)" })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiple filters combined", async () => {
      const cat1 = await Category.create(
        createCategoryData({ code: "CAT001", name: "Category 1" })
      );
      const cat2 = await Category.create(
        createCategoryData({ code: "CAT002", name: "Category 2" })
      );

      await Product.create([
        createProductData({
          sku: "ACTIVE-001",
          name: "Active Product",
          isActive: true,
          categoryId: cat1._id,
        }),
        createProductData({
          sku: "INACTIVE-001",
          name: "Inactive Product",
          isActive: false,
          categoryId: cat1._id,
        }),
        createProductData({
          sku: "ACTIVE-002",
          name: "Other Active",
          isActive: true,
          categoryId: cat2._id,
        }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({
          isActive: true,
          categoryId: cat1._id.toString(),
          search: "Active",
        })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].sku).toBe("ACTIVE-001");
    });

    it("should handle limit = 1", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat._id }),
        createProductData({ sku: "SKU002", name: "P2", categoryId: cat._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ limit: 1 })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
    });

    it("should handle large limit value", async () => {
      const cat = await Category.create(
        createCategoryData({ name: "Large Limit Cat" })
      );

      await Product.create([
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat._id }),
        createProductData({ sku: "SKU002", name: "P2", categoryId: cat._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ limit: 100 })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it("should work with user role (not just admin)", async () => {
      const cat = await Category.create(
        createCategoryData({ name: "User Role Cat" })
      );

      await Product.create(
        createProductData({
          sku: "USER-001",
          name: "User Product",
          categoryId: cat._id,
        })
      );

      const res = await request(app)
        .get("/api/products")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });

    it("should return suppliersCount = 0 when product has no suppliers", async () => {
      const cat = await Category.create(
        createCategoryData({ name: "No Supplier Cat" })
      );
      const product = await Product.create(
        createProductData({
          sku: "NO-SUPPLIER",
          name: "No Supplier Product",
          categoryId: cat._id,
        })
      );

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.suppliersCount).toBe(0);
    });

    it("should handle categoryId filter with no matching products", async () => {
      const cat1 = await Category.create(
        createCategoryData({ code: "CAT001", name: "Category 1" })
      );
      const cat2 = await Category.create(
        createCategoryData({ code: "CAT002", name: "Category 2" })
      );

      await Product.create(
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat1._id })
      );

      const res = await request(app)
        .get("/api/products")
        .query({ categoryId: cat2._id.toString() })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });

    it("should handle invalid boolean for isActive", async () => {
      const res = await request(app)
        .get("/api/products")
        .query({ isActive: "invalid" })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("should handle negative page number", async () => {
      const res = await request(app)
        .get("/api/products")
        .query({ page: -1 })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("should handle invalid categoryId format", async () => {
      const res = await request(app)
        .get("/api/products")
        .query({ categoryId: "not-valid-id" })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it("should handle search with empty string", async () => {
      const cat = await Category.create(createCategoryData());

      await Product.create([
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat._id }),
        createProductData({ sku: "SKU002", name: "P2", categoryId: cat._id }),
      ]);

      const res = await request(app)
        .get("/api/products")
        .query({ search: "" })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it("should handle pagination=false with many products", async () => {
      const cat = await Category.create(createCategoryData());

      // Create 25 products
      const products = [];
      for (let i = 1; i <= 25; i++) {
        products.push(
          createProductData({
            sku: `SKU${String(i).padStart(3, "0")}`,
            name: `Product ${i}`,
            categoryId: cat._id,
          })
        );
      }
      await Product.create(products);

      const res = await request(app)
        .get("/api/products")
        .query({ pagination: false })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(25);
      expect(res.body.pagination).toBeUndefined();
    });

    it("should populate category with correct fields", async () => {
      const cat = await Category.create(
        createCategoryData({
          code: "DETAILED",
          name: "Detailed Category",
          description: "Test Description",
        })
      );

      const product = await Product.create(
        createProductData({
          sku: "DETAIL-001",
          name: "Detail Product",
          categoryId: cat._id,
        })
      );

      const res = await request(app)
        .get(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.category).toBeDefined();
      expect(res.body.data.category._id).toBe(cat._id.toString());
      expect(res.body.data.category.name).toBe("Detailed Category");
    });

    it("should handle supplierId filter with no matches", async () => {
      const cat = await Category.create(createCategoryData());
      const fakeSupplier = new mongoose.Types.ObjectId();

      await Product.create(
        createProductData({ sku: "SKU001", name: "P1", categoryId: cat._id })
      );

      const res = await request(app)
        .get("/api/products")
        .query({ supplierId: fakeSupplier.toString() })
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(0);
    });
  });
});
