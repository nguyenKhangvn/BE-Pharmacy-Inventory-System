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
  createProductData,
} from "./setup/helpers.js";

import transactionRoutes from "../routes/transaction.route.js";
import {
  Product,
  Department,
  Warehouse,
  InventoryLot,
  Transaction,
  TransactionDetail,
} from "../models/index.js";

// ---- Setup Express test app
const app = express();
app.use(express.json());
app.use("/api/transactions", transactionRoutes);

// ---- Helpers to create fixtures
const createWarehouse = (overrides = {}) =>
  Warehouse.create({
    code: "WH001",
    name: "Main Warehouse",
    address: "QNU Campus",
    isActive: true,
    ...overrides,
  });

const createDepartment = (overrides = {}) =>
  Department.create({
    code: "DEPT001",
    name: "Khoa Nội",
    type: "clinical",
    phone: "0123456789",
    isActive: true,
    ...overrides,
  });

const createProduct = (overrides = {}) =>
  Product.create(
    createProductData({
      sku: "SKU001",
      name: "Paracetamol 500mg",
      unit: "viên",
      minimumStock: 5,
      currentStock: 0,
      ...overrides,
    })
  );

const createInventoryLot = (warehouseId, productId, overrides = {}) =>
  InventoryLot.create({
    productId,
    warehouseId,
    lotNumber: "LOT-TEST-001",
    quantity: 100,
    unitCost: 1000,
    expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    ...overrides,
  });

// Helper to create OUTBOUND transaction directly in DB
const createOutboundTransaction = async (userId, warehouseId, departmentId) => {
  const tx = await Transaction.create({
    type: "OUTBOUND",
    status: "COMPLETED",
    referenceCode: "OUT-001",
    notes: "Test outbound transaction",
    transactionDate: new Date(),
    userId,
    sourceWarehouseId: warehouseId,
    departmentId,
    completedAt: new Date(),
  });
  return tx;
};

// Shared variables for all describe blocks
let adminToken, userToken;
let adminUser, normalUser;

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

  adminToken = generateTestToken(adminUser);
  userToken = generateTestToken(normalUser);
});

afterAll(async () => {
  await closeDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

describe("GET /api/transactions?type=OUTBOUND - List OUTBOUND Transactions", () => {
  it("200 | should return empty list when no outbound transactions exist", async () => {
    const res = await request(app)
      .get("/api/transactions?type=OUTBOUND")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
    expect(res.body.data.pagination.totalPages).toBe(0);
  });

  it("200 | should return list of outbound transactions with default pagination", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    // Create 3 outbound transactions
    await Promise.all([
      createOutboundTransaction(adminUser._id, wh._id, dept._id),
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.referenceCode = "OUT-002";
        return tx.save();
      }),
      createOutboundTransaction(normalUser._id, wh._id, dept._id).then((tx) => {
        tx.referenceCode = "OUT-003";
        return tx.save();
      }),
    ]);

    const res = await request(app)
      .get("/api/transactions?type=OUTBOUND")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toHaveLength(3);
    expect(res.body.data.pagination.total).toBe(3);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(10);
    expect(res.body.data.pagination.totalPages).toBe(1);

    // Check populated fields
    const tx = res.body.data.transactions[0];
    expect(tx.sourceWarehouseId).toBeDefined();
    expect(tx.sourceWarehouseId.code).toBe("WH001");
    expect(tx.departmentId).toBeDefined();
    expect(tx.departmentId.code).toBe("DEPT001");
    expect(tx.userId).toBeDefined();
  });

  it("200 | should support pagination with page and limit", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    // Create 15 outbound transactions
    const promises = [];
    for (let i = 1; i <= 15; i++) {
      promises.push(
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = `OUT-${String(i).padStart(3, "0")}`;
            return tx.save();
          }
        )
      );
    }
    await Promise.all(promises);

    // Get page 1 with limit 10
    const res1 = await request(app)
      .get("/api/transactions?type=OUTBOUND&page=1&limit=10")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res1.body.data.transactions).toHaveLength(10);
    expect(res1.body.data.pagination.page).toBe(1);
    expect(res1.body.data.pagination.total).toBe(15);
    expect(res1.body.data.pagination.totalPages).toBe(2);

    // Get page 2 with limit 10
    const res2 = await request(app)
      .get("/api/transactions?type=OUTBOUND&page=2&limit=10")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res2.body.data.transactions).toHaveLength(5);
    expect(res2.body.data.pagination.page).toBe(2);
  });

  it("200 | should filter by search (referenceCode)", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    await Promise.all([
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.referenceCode = "OUT-AAA-001";
        return tx.save();
      }),
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.referenceCode = "OUT-BBB-002";
        return tx.save();
      }),
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.referenceCode = "OUT-AAA-003";
        return tx.save();
      }),
    ]);

    const res = await request(app)
      .get("/api/transactions?type=OUTBOUND&search=AAA")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toHaveLength(2);
    expect(res.body.data.transactions[0].referenceCode).toContain("AAA");
    expect(res.body.data.transactions[1].referenceCode).toContain("AAA");
  });

  it("200 | should filter by search (_id)", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    const tx = await createOutboundTransaction(adminUser._id, wh._id, dept._id);
    await createOutboundTransaction(adminUser._id, wh._id, dept._id);

    const res = await request(app)
      .get(`/api/transactions?type=OUTBOUND&search=${tx._id.toString()}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toHaveLength(1);
    expect(res.body.data.transactions[0]._id).toBe(tx._id.toString());
  });

  it("200 | should filter by date range (fromDate and toDate)", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    // Create transactions with different dates
    await Promise.all([
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.transactionDate = yesterday;
        return tx.save();
      }),
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.transactionDate = new Date();
        return tx.save();
      }),
      createOutboundTransaction(adminUser._id, wh._id, dept._id).then((tx) => {
        tx.transactionDate = nextWeek;
        return tx.save();
      }),
    ]);

    const res = await request(app)
      .get(
        `/api/transactions?type=OUTBOUND&fromDate=${yesterday.toISOString()}&toDate=${tomorrow.toISOString()}`
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toHaveLength(2);
  });

  it("200 | user role can also access the list", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    await createOutboundTransaction(normalUser._id, wh._id, dept._id);

    const res = await request(app)
      .get("/api/transactions?type=OUTBOUND")
      .set("Authorization", `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transactions).toHaveLength(1);
  });

  it("200 | should also accept type=INBOUND on the same endpoint", async () => {
    // This endpoint supports both INBOUND and OUTBOUND types
    const res = await request(app)
      .get("/api/transactions?type=INBOUND")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("transactions");
  });

  it("401 | should return error if not authenticated", async () => {
    await request(app).get("/api/transactions?type=OUTBOUND").expect(401);
  });
});

describe("GET /api/transactions/:id?type=OUTBOUND - Get OUTBOUND Transaction by ID", () => {
  it("200 | should return outbound transaction with details", async () => {
    const [wh, dept, prod] = await Promise.all([
      createWarehouse(),
      createDepartment(),
      createProduct(),
    ]);

    const lot = await createInventoryLot(wh._id, prod._id);

    const tx = await createOutboundTransaction(adminUser._id, wh._id, dept._id);

    // Create transaction details
    await TransactionDetail.create({
      transactionId: tx._id,
      productId: prod._id,
      inventoryLotId: lot._id,
      quantity: 10,
      unitPrice: 1200,
    });

    const res = await request(app)
      .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.header).toBeDefined();
    expect(res.body.data.header._id).toBe(tx._id.toString());
    expect(res.body.data.header.type).toBe("OUTBOUND");
    expect(res.body.data.header.sourceWarehouseId).toBeDefined();
    expect(res.body.data.header.sourceWarehouseId.code).toBe("WH001");
    expect(res.body.data.header.departmentId).toBeDefined();
    expect(res.body.data.header.departmentId.code).toBe("DEPT001");
    expect(res.body.data.header.userId).toBeDefined();

    // Check details
    expect(res.body.data.details).toHaveLength(1);
    expect(res.body.data.details[0].quantity).toBe(10);
    expect(res.body.data.details[0].unitPrice).toBe(1200);
    expect(res.body.data.details[0].productId).toBeDefined();
    expect(res.body.data.details[0].productId.sku).toBe("SKU001");
    expect(res.body.data.details[0].inventoryLotId).toBeDefined();
    expect(res.body.data.details[0].inventoryLotId.lotNumber).toBe(
      "LOT-TEST-001"
    );
  });

  it("200 | should return outbound transaction with multiple details", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    const prod1 = await createProduct({ sku: "SKU001", name: "Product 1" });
    const prod2 = await createProduct({ sku: "SKU002", name: "Product 2" });

    const lot1 = await createInventoryLot(wh._id, prod1._id, {
      lotNumber: "LOT-001",
    });
    const lot2 = await createInventoryLot(wh._id, prod2._id, {
      lotNumber: "LOT-002",
    });

    const tx = await createOutboundTransaction(adminUser._id, wh._id, dept._id);

    await TransactionDetail.insertMany([
      {
        transactionId: tx._id,
        productId: prod1._id,
        inventoryLotId: lot1._id,
        quantity: 10,
        unitPrice: 1000,
      },
      {
        transactionId: tx._id,
        productId: prod2._id,
        inventoryLotId: lot2._id,
        quantity: 20,
        unitPrice: 2000,
      },
    ]);

    const res = await request(app)
      .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.details).toHaveLength(2);
  });

  it("200 | user role can also access transaction detail", async () => {
    const [wh, dept, prod] = await Promise.all([
      createWarehouse(),
      createDepartment(),
      createProduct(),
    ]);

    const lot = await createInventoryLot(wh._id, prod._id);
    const tx = await createOutboundTransaction(
      normalUser._id,
      wh._id,
      dept._id
    );

    await TransactionDetail.create({
      transactionId: tx._id,
      productId: prod._id,
      inventoryLotId: lot._id,
      quantity: 5,
      unitPrice: 800,
    });

    const res = await request(app)
      .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
      .set("Authorization", `Bearer ${userToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.header._id).toBe(tx._id.toString());
  });

  it("404 | should return error if transaction not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/api/transactions/${fakeId}?type=OUTBOUND`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("not found");
  });

  it("400 | should return error if invalid id format", async () => {
    const res = await request(app)
      .get("/api/transactions/invalid-id?type=OUTBOUND")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid id");
  });

  it("404 | should not return INBOUND transaction when querying with type=OUTBOUND", async () => {
    const [wh, dept] = await Promise.all([
      createWarehouse(),
      createDepartment(),
    ]);

    // Create an INBOUND transaction
    const inboundTx = await Transaction.create({
      type: "INBOUND",
      status: "COMPLETED",
      referenceCode: "IN-001",
      notes: "Test inbound",
      transactionDate: new Date(),
      userId: adminUser._id,
      destinationWarehouseId: wh._id,
      supplierId: dept._id, // using dept as supplier for test
      completedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/transactions/${inboundTx._id}?type=OUTBOUND`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("not found");
  });

  it("401 | should return error if not authenticated", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await request(app)
      .get(`/api/transactions/${fakeId}?type=OUTBOUND`)
      .expect(401);
  });
});

describe("OUTBOUND Transaction API - Additional Test Cases", () => {
  describe("GET /api/transactions?type=OUTBOUND - Advanced filtering", () => {
    it("200 | should filter by search term across multiple fields", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse({ name: "Central Warehouse" }),
        createDepartment({ name: "Khoa Ngoại" }),
      ]);

      // Create 3 transactions with different reference codes
      await Promise.all([
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-SEARCH-001";
            tx.notes = "Test search functionality";
            return tx.save();
          }
        ),
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-002";
            tx.notes = "Regular outbound";
            return tx.save();
          }
        ),
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-SEARCH-003";
            tx.notes = "Another search test";
            return tx.save();
          }
        ),
      ]);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&search=SEARCH")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(2);
      expect(res.body.data.transactions[0].referenceCode).toContain("SEARCH");
    });

    it("200 | should filter by date range", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create transactions with different dates
      const oldDate = new Date("2024-01-01");
      const recentDate = new Date("2024-12-01");

      await Promise.all([
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-OLD",
          transactionDate: oldDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: oldDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-RECENT",
          transactionDate: recentDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: recentDate,
        }),
      ]);

      const res = await request(app)
        .get(
          `/api/transactions?type=OUTBOUND&fromDate=2024-11-01&toDate=2024-12-31`
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
      expect(res.body.data.transactions[0].referenceCode).toBe("OUT-RECENT");
    });

    it("200 | should handle pagination edge case with exactly limit items", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create exactly 10 transactions
      const promises = [];
      for (let i = 1; i <= 10; i++) {
        promises.push(
          createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
            (tx) => {
              tx.referenceCode = `OUT-${String(i).padStart(3, "0")}`;
              return tx.save();
            }
          )
        );
      }
      await Promise.all(promises);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&limit=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(10);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it("200 | should handle large page number beyond available data", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      await createOutboundTransaction(adminUser._id, wh._id, dept._id);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&page=999")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toEqual([]);
      expect(res.body.data.pagination.page).toBe(999);
    });
  });

  describe("GET /api/transactions/:id?type=OUTBOUND - Edge cases", () => {
    it("200 | should return transaction with populated fields", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse({ name: "Main WH", code: "WH001" }),
        createDepartment({ name: "Khoa Nội", code: "DEPT001" }),
      ]);

      const product = await createProduct({
        sku: "SKU001",
        name: "Paracetamol",
      });
      const lot = await createInventoryLot(wh._id, product._id, {
        lotNumber: "LOT-001",
        quantity: 100,
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-DETAIL",
        notes: "Test detail population",
        transactionDate: new Date(),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await TransactionDetail.create({
        transactionId: tx._id,
        productId: product._id,
        inventoryLotId: lot._id,
        quantity: 10,
        unitPrice: 1000,
      });

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.header.sourceWarehouseId.code).toBe("WH001");
      expect(res.body.data.header.departmentId.code).toBe("DEPT001");
      expect(res.body.data.details).toHaveLength(1);
      expect(res.body.data.details[0].productId.sku).toBe("SKU001");
      expect(res.body.data.details[0].inventoryLotId.lotNumber).toBe("LOT-001");
    });

    it("200 | should return transaction with multiple details", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const product1 = await createProduct({ sku: "SKU001" });
      const product2 = await createProduct({ sku: "SKU002" });
      const product3 = await createProduct({ sku: "SKU003" });

      const lot1 = await createInventoryLot(wh._id, product1._id, {
        lotNumber: "LOT-001",
      });
      const lot2 = await createInventoryLot(wh._id, product2._id, {
        lotNumber: "LOT-002",
      });
      const lot3 = await createInventoryLot(wh._id, product3._id, {
        lotNumber: "LOT-003",
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-MULTI",
        transactionDate: new Date(),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await Promise.all([
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product1._id,
          inventoryLotId: lot1._id,
          quantity: 10,
          unitPrice: 1000,
        }),
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product2._id,
          inventoryLotId: lot2._id,
          quantity: 20,
          unitPrice: 2000,
        }),
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product3._id,
          inventoryLotId: lot3._id,
          quantity: 30,
          unitPrice: 3000,
        }),
      ]);

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.details).toHaveLength(3);

      const skus = res.body.data.details.map((d) => d.productId.sku);
      expect(skus).toContain("SKU001");
      expect(skus).toContain("SKU002");
      expect(skus).toContain("SKU003");
    });

    it("200 | should verify transaction detail structure completeness", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const product = await createProduct({
        sku: "DETAIL-TEST",
        name: "Test Product",
        unit: "viên",
      });

      const lot = await createInventoryLot(wh._id, product._id, {
        lotNumber: "LOT-DETAIL",
        quantity: 500,
        unitCost: 5000,
        expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-STRUCTURE",
        transactionDate: new Date("2024-12-01T10:00:00Z"),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await TransactionDetail.create({
        transactionId: tx._id,
        productId: product._id,
        inventoryLotId: lot._id,
        quantity: 25,
        unitPrice: 5500,
      });

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const detail = res.body.data.details[0];
      expect(detail.productId.sku).toBe("DETAIL-TEST");
      expect(detail.productId.name).toBe("Test Product");
      expect(detail.productId.unit).toBe("viên");
      expect(detail.inventoryLotId.lotNumber).toBe("LOT-DETAIL");
      expect(detail.inventoryLotId.unitCost).toBe(5000);
      expect(detail.quantity).toBe(25);
      expect(detail.unitPrice).toBe(5500);
    });
  });

  describe("GET /api/transactions - OUTBOUND role-based access", () => {
    it("200 | admin can view all outbound transactions", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create transactions by different users
      await Promise.all([
        createOutboundTransaction(adminUser._id, wh._id, dept._id),
        createOutboundTransaction(normalUser._id, wh._id, dept._id),
      ]);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(2);
    });

    it("200 | normal user can view outbound transactions", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      await createOutboundTransaction(normalUser._id, wh._id, dept._id);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
    });

    it("401 | should reject request without authentication", async () => {
      await request(app).get("/api/transactions?type=OUTBOUND").expect(401);
    });
  });

  describe("GET /api/transactions - OUTBOUND combined filters", () => {
    it("200 | should combine search and date filters", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const testDate = new Date("2024-06-15");

      await Promise.all([
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-FILTER-001",
          transactionDate: testDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: testDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-OTHER-002",
          transactionDate: testDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: testDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-FILTER-003",
          transactionDate: new Date("2024-01-01"),
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: new Date("2024-01-01"),
        }),
      ]);

      const res = await request(app)
        .get(
          `/api/transactions?type=OUTBOUND&search=FILTER&fromDate=2024-06-01&toDate=2024-06-30`
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
      expect(res.body.data.transactions[0].referenceCode).toBe(
        "OUT-FILTER-001"
      );
    });

    it("200 | should handle search with pagination", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create 15 transactions matching search
      const promises = [];
      for (let i = 1; i <= 15; i++) {
        promises.push(
          createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
            (tx) => {
              tx.referenceCode = `OUT-PAGE-${String(i).padStart(3, "0")}`;
              return tx.save();
            }
          )
        );
      }
      await Promise.all(promises);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&search=PAGE&page=2&limit=5")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(5);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });
  });
});

describe("OUTBOUND Transaction API - Additional Test Cases", () => {
  describe("GET /api/transactions?type=OUTBOUND - Advanced filtering", () => {
    it("200 | should filter by search term across multiple fields", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse({ name: "Central Warehouse" }),
        createDepartment({ name: "Khoa Ngoại" }),
      ]);

      // Create 3 transactions with different reference codes
      await Promise.all([
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-SEARCH-001";
            tx.notes = "Test search functionality";
            return tx.save();
          }
        ),
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-002";
            tx.notes = "Regular outbound";
            return tx.save();
          }
        ),
        createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
          (tx) => {
            tx.referenceCode = "OUT-SEARCH-003";
            tx.notes = "Another search test";
            return tx.save();
          }
        ),
      ]);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&search=SEARCH")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(2);
      expect(res.body.data.transactions[0].referenceCode).toContain("SEARCH");
    });

    it("200 | should filter by date range", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create transactions with different dates
      const oldDate = new Date("2024-01-01");
      const recentDate = new Date("2024-12-01");

      await Promise.all([
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-OLD",
          transactionDate: oldDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: oldDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-RECENT",
          transactionDate: recentDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: recentDate,
        }),
      ]);

      const res = await request(app)
        .get(
          `/api/transactions?type=OUTBOUND&fromDate=2024-11-01&toDate=2024-12-31`
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
      expect(res.body.data.transactions[0].referenceCode).toBe("OUT-RECENT");
    });

    it("200 | should handle pagination edge case with exactly limit items", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create exactly 10 transactions
      const promises = [];
      for (let i = 1; i <= 10; i++) {
        promises.push(
          createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
            (tx) => {
              tx.referenceCode = `OUT-${String(i).padStart(3, "0")}`;
              return tx.save();
            }
          )
        );
      }
      await Promise.all(promises);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&limit=10")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(10);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it("200 | should handle large page number beyond available data", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      await createOutboundTransaction(adminUser._id, wh._id, dept._id);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&page=999")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toEqual([]);
      expect(res.body.data.pagination.page).toBe(999);
    });
  });

  describe("GET /api/transactions/:id?type=OUTBOUND - Edge cases", () => {
    it("200 | should return transaction with populated fields", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse({ name: "Main WH", code: "WH001" }),
        createDepartment({ name: "Khoa Nội", code: "DEPT001" }),
      ]);

      const product = await createProduct({
        sku: "SKU001",
        name: "Paracetamol",
      });
      const lot = await createInventoryLot(wh._id, product._id, {
        lotNumber: "LOT-001",
        quantity: 100,
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-DETAIL",
        notes: "Test detail population",
        transactionDate: new Date(),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await TransactionDetail.create({
        transactionId: tx._id,
        productId: product._id,
        inventoryLotId: lot._id,
        quantity: 10,
        unitPrice: 1000,
      });

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.header.sourceWarehouseId.code).toBe("WH001");
      expect(res.body.data.header.departmentId.code).toBe("DEPT001");
      expect(res.body.data.details).toHaveLength(1);
      expect(res.body.data.details[0].productId.sku).toBe("SKU001");
      expect(res.body.data.details[0].inventoryLotId.lotNumber).toBe("LOT-001");
    });

    it("200 | should return transaction with multiple details", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const product1 = await createProduct({ sku: "SKU001" });
      const product2 = await createProduct({ sku: "SKU002" });
      const product3 = await createProduct({ sku: "SKU003" });

      const lot1 = await createInventoryLot(wh._id, product1._id, {
        lotNumber: "LOT-001",
      });
      const lot2 = await createInventoryLot(wh._id, product2._id, {
        lotNumber: "LOT-002",
      });
      const lot3 = await createInventoryLot(wh._id, product3._id, {
        lotNumber: "LOT-003",
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-MULTI",
        transactionDate: new Date(),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await Promise.all([
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product1._id,
          inventoryLotId: lot1._id,
          quantity: 10,
          unitPrice: 1000,
        }),
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product2._id,
          inventoryLotId: lot2._id,
          quantity: 20,
          unitPrice: 2000,
        }),
        TransactionDetail.create({
          transactionId: tx._id,
          productId: product3._id,
          inventoryLotId: lot3._id,
          quantity: 30,
          unitPrice: 3000,
        }),
      ]);

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.details).toHaveLength(3);

      const skus = res.body.data.details.map((d) => d.productId.sku);
      expect(skus).toContain("SKU001");
      expect(skus).toContain("SKU002");
      expect(skus).toContain("SKU003");
    });

    it("200 | should verify transaction detail structure completeness", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const product = await createProduct({
        sku: "DETAIL-TEST",
        name: "Test Product",
        unit: "viên",
      });

      const lot = await createInventoryLot(wh._id, product._id, {
        lotNumber: "LOT-DETAIL",
        quantity: 500,
        unitCost: 5000,
        expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      });

      const tx = await Transaction.create({
        type: "OUTBOUND",
        status: "COMPLETED",
        referenceCode: "OUT-STRUCTURE",
        transactionDate: new Date("2024-12-01T10:00:00Z"),
        userId: adminUser._id,
        sourceWarehouseId: wh._id,
        departmentId: dept._id,
        completedAt: new Date(),
      });

      await TransactionDetail.create({
        transactionId: tx._id,
        productId: product._id,
        inventoryLotId: lot._id,
        quantity: 25,
        unitPrice: 5500,
      });

      const res = await request(app)
        .get(`/api/transactions/${tx._id}?type=OUTBOUND`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const detail = res.body.data.details[0];
      expect(detail.productId.sku).toBe("DETAIL-TEST");
      expect(detail.productId.name).toBe("Test Product");
      expect(detail.productId.unit).toBe("viên");
      expect(detail.inventoryLotId.lotNumber).toBe("LOT-DETAIL");
      expect(detail.inventoryLotId.unitCost).toBe(5000);
      expect(detail.quantity).toBe(25);
      expect(detail.unitPrice).toBe(5500);
    });
  });

  describe("GET /api/transactions - OUTBOUND role-based access", () => {
    it("200 | admin can view all outbound transactions", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create transactions by different users
      await Promise.all([
        createOutboundTransaction(adminUser._id, wh._id, dept._id),
        createOutboundTransaction(normalUser._id, wh._id, dept._id),
      ]);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(2);
    });

    it("200 | normal user can view outbound transactions", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      await createOutboundTransaction(normalUser._id, wh._id, dept._id);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
    });

    it("401 | should reject request without authentication", async () => {
      await request(app).get("/api/transactions?type=OUTBOUND").expect(401);
    });
  });

  describe("GET /api/transactions - OUTBOUND combined filters", () => {
    it("200 | should combine search and date filters", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      const testDate = new Date("2024-06-15");

      await Promise.all([
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-FILTER-001",
          transactionDate: testDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: testDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-OTHER-002",
          transactionDate: testDate,
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: testDate,
        }),
        Transaction.create({
          type: "OUTBOUND",
          status: "COMPLETED",
          referenceCode: "OUT-FILTER-003",
          transactionDate: new Date("2024-01-01"),
          userId: adminUser._id,
          sourceWarehouseId: wh._id,
          departmentId: dept._id,
          completedAt: new Date("2024-01-01"),
        }),
      ]);

      const res = await request(app)
        .get(
          `/api/transactions?type=OUTBOUND&search=FILTER&fromDate=2024-06-01&toDate=2024-06-30`
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(1);
      expect(res.body.data.transactions[0].referenceCode).toBe(
        "OUT-FILTER-001"
      );
    });

    it("200 | should handle search with pagination", async () => {
      const [wh, dept] = await Promise.all([
        createWarehouse(),
        createDepartment(),
      ]);

      // Create 15 transactions matching search
      const promises = [];
      for (let i = 1; i <= 15; i++) {
        promises.push(
          createOutboundTransaction(adminUser._id, wh._id, dept._id).then(
            (tx) => {
              tx.referenceCode = `OUT-PAGE-${String(i).padStart(3, "0")}`;
              return tx.save();
            }
          )
        );
      }
      await Promise.all(promises);

      const res = await request(app)
        .get("/api/transactions?type=OUTBOUND&search=PAGE&page=2&limit=5")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toHaveLength(5);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });
  });
});
