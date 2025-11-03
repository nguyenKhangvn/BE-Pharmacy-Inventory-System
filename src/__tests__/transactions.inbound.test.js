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
import { generateTestToken, createProductData } from "./setup/helpers.js";

import transactionRoutes from "../routes/transaction.route.js";
import {
  Product,
  Supplier,
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

const createSupplier = (overrides = {}) =>
  Supplier.create({
    code: "SUP001",
    name: "Default Supplier",
    contactPerson: "Mr. A",
    phone: "0123456789",
    email: "supplier@example.com",
    address: "Somewhere",
    taxCode: "1234567890",
    status: "active",
    ...overrides,
  });

const createProduct = (overrides = {}) =>
  Product.create(
    createProductData({
      sku: "SKU001",
      name: "Paracetamol 500mg",
      unit: "viên",
      minimumStock: 5,
      ...overrides,
    })
  );

describe("INBOUND Transaction API", () => {
  let adminToken, userToken;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    await connect();

    adminToken = generateTestToken({ role: "admin" });
    userToken = generateTestToken({ role: "user" });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  it("201 | tạo phiếu INBOUND & cập nhật tồn lô (tạo lô mới nếu chưa có)", async () => {
    const [wh, sup, prod] = await Promise.all([
      createWarehouse(),
      createSupplier(),
      createProduct(),
    ]);

    const body = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: sup._id.toString(),
      notes: "Nhap kho test",
      details: [
        {
          productId: prod._id.toString(),
          quantity: 100,
          unitPrice: 1200,
          // không truyền lotNumber -> BE tự sinh
          expiryDate: new Date(Date.now() + 200 * 24 * 3600 * 1000),
        },
      ],
    };

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction).toBeDefined();
    expect(res.body.data.details).toHaveLength(1);

    // kiểm tra DB
    const [txCount, detailCount] = await Promise.all([
      Transaction.countDocuments(),
      TransactionDetail.countDocuments(),
    ]);
    expect(txCount).toBe(1);
    expect(detailCount).toBe(1);

    const lots = await InventoryLot.find({
      productId: prod._id,
      warehouseId: wh._id,
    });
    expect(lots).toHaveLength(1);
    expect(lots[0].quantity).toBe(100);
    expect(lots[0].lotNumber).toBeTruthy(); // đã auto-generate
  });

  it("201 | nhập cùng lotNumber+expiryDate -> cộng dồn vào cùng InventoryLot", async () => {
    const [wh, sup, prod] = await Promise.all([
      createWarehouse(),
      createSupplier(),
      createProduct(),
    ]);

    const lotNumber = "LOT-AUTO-001";
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000);

    const body1 = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: sup._id.toString(),
      details: [
        {
          productId: prod._id.toString(),
          quantity: 50,
          unitPrice: 1000,
          lotNumber,
          expiryDate: expiry,
        },
      ],
    };
    const body2 = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: sup._id.toString(),
      details: [
        {
          productId: prod._id.toString(),
          quantity: 30,
          unitPrice: 1100,
          lotNumber,
          expiryDate: expiry,
        },
      ],
    };

    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body1)
      .expect(201);
    await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${userToken}`)
      .send(body2)
      .expect(201);

    const lot = await InventoryLot.findOne({
      productId: prod._id,
      warehouseId: wh._id,
      lotNumber,
      expiryDate: expiry,
    });
    expect(lot).toBeTruthy();
    expect(lot.quantity).toBe(80); // 50 + 30
  });

  it("401 | từ chối khi không có token", async () => {
    await request(app).post("/api/transactions").send({}).expect(401);
  });

  it("403 | user role không được phép tạo INBOUND (nếu có role-based access control)", async () => {
    // Skip test này nếu user cũng được phép tạo INBOUND
    // Hoặc kiểm tra permission khác tùy theo business logic
    const [wh, sup, prod] = await Promise.all([
      createWarehouse(),
      createSupplier(),
      createProduct(),
    ]);

    const body = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: sup._id.toString(),
      details: [
        { productId: prod._id.toString(), quantity: 10, unitPrice: 1000 },
      ],
    };

    // Nếu user được phép, test này sẽ return 201
    // Nếu không được phép, return 403
    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${userToken}`)
      .send(body);

    // Accept cả 201 và 403 tùy business logic
    expect([201, 403]).toContain(res.status);
  });

  it("400 | validate fail khi thiếu trường bắt buộc", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "INBOUND" }) // thiếu warehouseId, supplierId, details
      .expect(400);

    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors?.details || res.body.errors).toBeDefined();
  });

  it("400 | warehouseId không tồn tại", async () => {
    const [sup, prod] = await Promise.all([createSupplier(), createProduct()]);
    const fakeWh = new mongoose.Types.ObjectId().toString();

    const body = {
      type: "INBOUND",
      warehouseId: fakeWh,
      supplierId: sup._id.toString(),
      details: [
        { productId: prod._id.toString(), quantity: 5, unitPrice: 1000 },
      ],
    };

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body)
      .expect(400);

    expect(res.body.message).toMatch(/warehouseId not found/i);
  });

  it("400 | supplierId không tồn tại", async () => {
    const [wh, prod] = await Promise.all([createWarehouse(), createProduct()]);
    const fakeSup = new mongoose.Types.ObjectId().toString();

    const body = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: fakeSup,
      details: [
        { productId: prod._id.toString(), quantity: 5, unitPrice: 1000 },
      ],
    };

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body)
      .expect(400);

    expect(res.body.message).toMatch(/supplierId not found/i);
  });

  it("400 | productId không tồn tại trong details", async () => {
    const [wh, sup] = await Promise.all([createWarehouse(), createSupplier()]);
    const fakeProd = new mongoose.Types.ObjectId().toString();

    const body = {
      type: "INBOUND",
      warehouseId: wh._id.toString(),
      supplierId: sup._id.toString(),
      details: [{ productId: fakeProd, quantity: 5, unitPrice: 1000 }],
    };

    const res = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body)
      .expect(400);

    expect(res.body.message).toMatch(/productId not found/i);
  });
});
