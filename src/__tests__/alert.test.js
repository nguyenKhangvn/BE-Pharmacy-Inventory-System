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
  createWarehouseData,
  createInventoryLotData,
  createAlertData,
} from "./setup/helpers.js";
import alertRoutes from "../routes/alert.route.js";
import { Product, Warehouse, InventoryLot, Alert } from "../models/index.js";

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use("/api/alerts", alertRoutes);

describe("Alert API Tests", () => {
  let authToken;
  let adminUser;
  let testProduct;
  let testWarehouse;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    await connect();

    // Create test user
    adminUser = await createTestUser({
      username: "adminuser",
      email: "admin@example.com",
      role: "admin",
    });

    authToken = generateTestToken(adminUser);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe("GET /api/alerts/summary", () => {
    it("should return summary of alerts", async () => {
      // Create test product
      testProduct = await Product.create(
        createProductData({ sku: "MED001", name: "Paracetamol" })
      );

      // Create alerts
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          alertType: "LOW_STOCK",
          severity: "HIGH",
        }),
        createAlertData({
          productId: testProduct._id,
          productSku: "MED002",
          alertType: "EXPIRING_SOON",
          severity: "MEDIUM",
        }),
        createAlertData({
          productId: testProduct._id,
          productSku: "MED003",
          alertType: "OUT_OF_STOCK",
          severity: "CRITICAL",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts/summary")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("totalAlerts");
      expect(res.body.data).toHaveProperty("expiringSoon");
      expect(res.body.data).toHaveProperty("lowStock");
      expect(res.body.data.totalAlerts).toBe(3);
      expect(res.body.data.expiringSoon).toBe(1);
      expect(res.body.data.lowStock).toBe(2);
    });

    it("should return zeros when no alerts exist", async () => {
      const res = await request(app)
        .get("/api/alerts/summary")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAlerts).toBe(0);
      expect(res.body.data.expiringSoon).toBe(0);
      expect(res.body.data.lowStock).toBe(0);
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/api/alerts/summary");

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/alerts/details", () => {
    beforeEach(async () => {
      testProduct = await Product.create(
        createProductData({ sku: "MED001", name: "Paracetamol" })
      );
    });

    it("should return paginated alert details", async () => {
      // Create multiple alerts
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          productName: "Paracetamol",
          alertType: "LOW_STOCK",
        }),
        createAlertData({
          productId: testProduct._id,
          productSku: "MED002",
          productName: "Ibuprofen",
          alertType: "EXPIRING_SOON",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts/details")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(2);
    });

    it("should filter alerts by search query", async () => {
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          productName: "Paracetamol",
          alertType: "LOW_STOCK",
        }),
        createAlertData({
          productId: testProduct._id,
          productSku: "MED002",
          productName: "Ibuprofen",
          alertType: "EXPIRING_SOON",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts/details?search=Para")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].productName).toContain("Paracetamol");
    });

    it("should support pagination", async () => {
      // Create 5 alerts
      for (let i = 1; i <= 5; i++) {
        await Alert.create(
          createAlertData({
            productId: testProduct._id,
            productSku: `MED00${i}`,
            productName: `Medicine ${i}`,
          })
        );
      }

      const res = await request(app)
        .get("/api/alerts/details?page=1&limit=3")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.pages).toBe(2);
    });
  });

  describe("GET /api/alerts/statistics", () => {
    it("should return statistics of active alerts", async () => {
      testProduct = await Product.create(createProductData());

      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          alertType: "LOW_STOCK",
          severity: "CRITICAL",
        }),
        createAlertData({
          productId: testProduct._id,
          alertType: "EXPIRED",
          severity: "CRITICAL",
        }),
        createAlertData({
          productId: testProduct._id,
          alertType: "EXPIRING_SOON",
          severity: "HIGH",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts/statistics")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("total", 3);
      expect(res.body.data).toHaveProperty("critical", 2);
      expect(res.body.data).toHaveProperty("high", 1);
    });
  });

  describe("GET /api/alerts", () => {
    beforeEach(async () => {
      testProduct = await Product.create(createProductData());
    });

    it("should get alerts with default pagination", async () => {
      await Alert.create(
        createAlertData({
          productId: testProduct._id,
        })
      );

      const res = await request(app)
        .get("/api/alerts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
    });

    it("should filter alerts by alertType", async () => {
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          alertType: "LOW_STOCK",
        }),
        createAlertData({
          productId: testProduct._id,
          alertType: "EXPIRED",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts?alertType=LOW_STOCK")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].alertType).toBe("LOW_STOCK");
    });

    it("should filter alerts by severity", async () => {
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          severity: "CRITICAL",
        }),
        createAlertData({
          productId: testProduct._id,
          severity: "LOW",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts?severity=CRITICAL")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].severity).toBe("CRITICAL");
    });

    it("should filter alerts by status", async () => {
      await Alert.create([
        createAlertData({
          productId: testProduct._id,
          status: "ACTIVE",
        }),
        createAlertData({
          productId: testProduct._id,
          status: "RESOLVED",
        }),
      ]);

      const res = await request(app)
        .get("/api/alerts?status=RESOLVED")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe("RESOLVED");
    });
  });

  describe("GET /api/alerts/:id", () => {
    it("should get alert by id", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
        })
      );

      const res = await request(app)
        .get(`/api/alerts/${alert._id}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(alert._id.toString());
    });

    it("should return 404 for non-existent alert", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/alerts/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("PATCH /api/alerts/:id/acknowledge", () => {
    it("should acknowledge an alert", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
          status: "ACTIVE",
        })
      );

      const res = await request(app)
        .patch(`/api/alerts/${alert._id}/acknowledge`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ notes: "Đã xác nhận" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ACKNOWLEDGED");
      expect(res.body.data.acknowledgedBy).toBe(adminUser._id.toString());
      expect(res.body.data.acknowledgedAt).toBeDefined();
    });

    it("should not acknowledge non-ACTIVE alert", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
          status: "RESOLVED",
        })
      );

      const res = await request(app)
        .patch(`/api/alerts/${alert._id}/acknowledge`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ notes: "Test" });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/alerts/:id/resolve", () => {
    it("should resolve an alert", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
          status: "ACTIVE",
        })
      );

      const res = await request(app)
        .patch(`/api/alerts/${alert._id}/resolve`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ notes: "Đã giải quyết" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("RESOLVED");
      expect(res.body.data.resolvedBy).toBe(adminUser._id.toString());
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it("should not resolve already resolved alert", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
          status: "RESOLVED",
        })
      );

      const res = await request(app)
        .patch(`/api/alerts/${alert._id}/resolve`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({ notes: "Test" });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/alerts/:id", () => {
    it("should delete an alert", async () => {
      testProduct = await Product.create(createProductData());
      const alert = await Alert.create(
        createAlertData({
          productId: testProduct._id,
        })
      );

      const res = await request(app)
        .delete(`/api/alerts/${alert._id}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const deletedAlert = await Alert.findById(alert._id);
      expect(deletedAlert).toBeNull();
    });

    it("should return 404 for non-existent alert", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/alerts/${fakeId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/alerts/jobs", () => {
    it("should return list of cron jobs", async () => {
      const res = await request(app)
        .get("/api/alerts/jobs")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/alerts/scan", () => {
    it("should trigger manual scan", async () => {
      // Create test data
      testProduct = await Product.create(
        createProductData({
          sku: "MED001",
          currentStock: 5,
          minimumStock: 10,
        })
      );

      const res = await request(app)
        .post("/api/alerts/scan")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("lowStock");
      expect(res.body.data).toHaveProperty("outOfStock");
      expect(res.body.data).toHaveProperty("expiringSoon");
      expect(res.body.data).toHaveProperty("expired");
    });
  });
});
