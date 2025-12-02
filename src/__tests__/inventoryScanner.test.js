import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";
import mongoose from "mongoose";
import { connect, closeDatabase, clearDatabase } from "./setup/db.js";
import {
  createProductData,
  createWarehouseData,
  createInventoryLotData,
} from "./setup/helpers.js";
import { Product, Warehouse, InventoryLot, Alert } from "../models/index.js";
import inventoryScanner from "../services/inventoryScanner.service.js";

describe("Inventory Scanner Service Tests", () => {
  let testProduct;
  let testWarehouse;

  beforeAll(async () => {
    await connect();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  describe("scanStockLevels", () => {
    it("should detect OUT_OF_STOCK products", async () => {
      testProduct = await Product.create(
        createProductData({
          sku: "MED001",
          name: "Paracetamol",
          currentStock: 0,
          minimumStock: 10,
        })
      );

      const results = { lowStock: 0, outOfStock: 0, errors: [] };
      await inventoryScanner.scanStockLevels(results);

      expect(results.outOfStock).toBe(1);
      expect(results.lowStock).toBe(0);

      const alerts = await Alert.find({ alertType: "OUT_OF_STOCK" });
      expect(alerts.length).toBe(1);
      expect(alerts[0].productSku).toBe("MED001");
      expect(alerts[0].severity).toBe("CRITICAL");
    });

    it("should detect LOW_STOCK products", async () => {
      testProduct = await Product.create(
        createProductData({
          sku: "MED002",
          name: "Ibuprofen",
          currentStock: 5,
          minimumStock: 20,
        })
      );

      const results = { lowStock: 0, outOfStock: 0, errors: [] };
      await inventoryScanner.scanStockLevels(results);

      expect(results.lowStock).toBe(1);
      expect(results.outOfStock).toBe(0);

      const alerts = await Alert.find({ alertType: "LOW_STOCK" });
      expect(alerts.length).toBe(1);
      expect(alerts[0].productSku).toBe("MED002");
      expect(alerts[0].currentStock).toBe(5);
      expect(alerts[0].minimumStock).toBe(20);
    });

    it("should calculate correct severity for LOW_STOCK", async () => {
      // Test CRITICAL severity (<=25%)
      const product1 = await Product.create(
        createProductData({
          sku: "MED003",
          currentStock: 2,
          minimumStock: 10, // 20%
        })
      );

      // Test HIGH severity (<=50%)
      const product2 = await Product.create(
        createProductData({
          sku: "MED004",
          currentStock: 4,
          minimumStock: 10, // 40%
        })
      );

      // Test MEDIUM severity (<=75%)
      const product3 = await Product.create(
        createProductData({
          sku: "MED005",
          currentStock: 7,
          minimumStock: 10, // 70%
        })
      );

      const results = { lowStock: 0, outOfStock: 0, errors: [] };
      await inventoryScanner.scanStockLevels(results);

      const alert1 = await Alert.findOne({ productSku: "MED003" });
      expect(alert1.severity).toBe("CRITICAL");

      const alert2 = await Alert.findOne({ productSku: "MED004" });
      expect(alert2.severity).toBe("HIGH");

      const alert3 = await Alert.findOne({ productSku: "MED005" });
      expect(alert3.severity).toBe("MEDIUM");
    });

    it("should not create alerts for products with sufficient stock", async () => {
      testProduct = await Product.create(
        createProductData({
          sku: "MED006",
          currentStock: 100,
          minimumStock: 10,
        })
      );

      const results = { lowStock: 0, outOfStock: 0, errors: [] };
      await inventoryScanner.scanStockLevels(results);

      expect(results.lowStock).toBe(0);
      expect(results.outOfStock).toBe(0);

      const alerts = await Alert.find({ productSku: "MED006" });
      expect(alerts.length).toBe(0);
    });

    it("should skip inactive products", async () => {
      testProduct = await Product.create(
        createProductData({
          sku: "MED007",
          currentStock: 0,
          minimumStock: 10,
          isActive: false,
        })
      );

      const results = { lowStock: 0, outOfStock: 0, errors: [] };
      await inventoryScanner.scanStockLevels(results);

      expect(results.outOfStock).toBe(0);
      const alerts = await Alert.find({ productSku: "MED007" });
      expect(alerts.length).toBe(0);
    });
  });

  describe("scanExpiryDates", () => {
    beforeEach(async () => {
      testProduct = await Product.create(
        createProductData({
          sku: "MED001",
          name: "Test Medicine",
        })
      );
      testWarehouse = await Warehouse.create(
        createWarehouseData({ name: "Main Warehouse" })
      );
    });

    it("should detect EXPIRED lots", async () => {
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 10); // 10 days ago

      await InventoryLot.create(
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT001",
          quantity: 50,
          expiryDate: expiredDate,
        })
      );

      const results = { expiringSoon: 0, expired: 0, errors: [] };
      await inventoryScanner.scanExpiryDates(results);

      expect(results.expired).toBe(1);

      const alerts = await Alert.find({ alertType: "EXPIRED" });
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe("CRITICAL");
      expect(alerts[0].lotNumber).toBe("LOT001");
    });

    it("should detect EXPIRING_SOON lots (within 30 days)", async () => {
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + 15); // 15 days from now

      await InventoryLot.create(
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT002",
          quantity: 50,
          expiryDate: expiringDate,
        })
      );

      const results = { expiringSoon: 0, expired: 0, errors: [] };
      await inventoryScanner.scanExpiryDates(results);

      expect(results.expiringSoon).toBe(1);

      const alerts = await Alert.find({ alertType: "EXPIRING_SOON" });
      expect(alerts.length).toBe(1);
      expect(alerts[0].lotNumber).toBe("LOT002");
    });

    it("should calculate correct severity for EXPIRING_SOON", async () => {
      // HIGH severity (<=7 days)
      const date1 = new Date();
      date1.setDate(date1.getDate() + 5);

      // MEDIUM severity (<=15 days)
      const date2 = new Date();
      date2.setDate(date2.getDate() + 10);

      // LOW severity (<=30 days)
      const date3 = new Date();
      date3.setDate(date3.getDate() + 25);

      await InventoryLot.create([
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT003",
          expiryDate: date1,
          quantity: 10,
        }),
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT004",
          expiryDate: date2,
          quantity: 10,
        }),
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT005",
          expiryDate: date3,
          quantity: 10,
        }),
      ]);

      const results = { expiringSoon: 0, expired: 0, errors: [] };
      await inventoryScanner.scanExpiryDates(results);

      const alert1 = await Alert.findOne({ lotNumber: "LOT003" });
      expect(alert1.severity).toBe("HIGH");

      const alert2 = await Alert.findOne({ lotNumber: "LOT004" });
      expect(alert2.severity).toBe("MEDIUM");

      const alert3 = await Alert.findOne({ lotNumber: "LOT005" });
      expect(alert3.severity).toBe("LOW");
    });

    it("should not create alerts for lots with quantity = 0", async () => {
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + 15);

      await InventoryLot.create(
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT006",
          quantity: 0,
          expiryDate: expiringDate,
        })
      );

      const results = { expiringSoon: 0, expired: 0, errors: [] };
      await inventoryScanner.scanExpiryDates(results);

      expect(results.expiringSoon).toBe(0);
      const alerts = await Alert.find({ lotNumber: "LOT006" });
      expect(alerts.length).toBe(0);
    });

    it("should not create alerts for lots expiring after 30 days", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60); // 60 days from now

      await InventoryLot.create(
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT007",
          quantity: 50,
          expiryDate: futureDate,
        })
      );

      const results = { expiringSoon: 0, expired: 0, errors: [] };
      await inventoryScanner.scanExpiryDates(results);

      expect(results.expiringSoon).toBe(0);
      const alerts = await Alert.find({ lotNumber: "LOT007" });
      expect(alerts.length).toBe(0);
    });
  });

  describe("createOrUpdateAlert", () => {
    beforeEach(async () => {
      testProduct = await Product.create(createProductData());
    });

    it("should create new alert if none exists", async () => {
      const alertData = {
        alertType: "LOW_STOCK",
        severity: "HIGH",
        productId: testProduct._id,
        productSku: testProduct.sku,
        productName: testProduct.name,
        currentStock: 5,
        minimumStock: 10,
        message: "Test message",
      };

      await inventoryScanner.createOrUpdateAlert(alertData);

      const alerts = await Alert.find({ productId: testProduct._id });
      expect(alerts.length).toBe(1);
      expect(alerts[0].alertType).toBe("LOW_STOCK");
    });

    it("should update existing ACTIVE alert instead of creating duplicate", async () => {
      const alertData = {
        alertType: "LOW_STOCK",
        severity: "HIGH",
        productId: testProduct._id,
        productSku: testProduct.sku,
        productName: testProduct.name,
        currentStock: 5,
        minimumStock: 10,
        message: "Initial message",
      };

      // Create first alert
      await inventoryScanner.createOrUpdateAlert(alertData);

      // Try to create same alert again
      alertData.message = "Updated message";
      alertData.currentStock = 3;
      await inventoryScanner.createOrUpdateAlert(alertData);

      // Should only have 1 alert
      const alerts = await Alert.find({ productId: testProduct._id });
      expect(alerts.length).toBe(1);
      expect(alerts[0].message).toBe("Updated message");
      expect(alerts[0].currentStock).toBe(3);
    });
  });

  describe("autoResolveAlerts", () => {
    beforeEach(async () => {
      testProduct = await Product.create(
        createProductData({
          currentStock: 5,
          minimumStock: 10,
        })
      );
      testWarehouse = await Warehouse.create(createWarehouseData());
    });

    it("should resolve OUT_OF_STOCK alert when stock is replenished", async () => {
      // Create OUT_OF_STOCK alert
      await Alert.create({
        alertType: "OUT_OF_STOCK",
        severity: "CRITICAL",
        productId: testProduct._id,
        productSku: testProduct.sku,
        productName: testProduct.name,
        currentStock: 0,
        minimumStock: 10,
        message: "Out of stock",
        status: "ACTIVE",
      });

      // Update product stock
      testProduct.currentStock = 15;
      await testProduct.save();

      // Run auto resolve
      await inventoryScanner.autoResolveAlerts();

      const alert = await Alert.findOne({ productId: testProduct._id });
      expect(alert.status).toBe("RESOLVED");
      expect(alert.notes).toContain("Auto-resolved");
    });

    it("should resolve LOW_STOCK alert when stock reaches minimum", async () => {
      await Alert.create({
        alertType: "LOW_STOCK",
        severity: "HIGH",
        productId: testProduct._id,
        productSku: testProduct.sku,
        productName: testProduct.name,
        currentStock: 5,
        minimumStock: 10,
        message: "Low stock",
        status: "ACTIVE",
      });

      // Update product stock to meet minimum
      testProduct.currentStock = 10;
      await testProduct.save();

      await inventoryScanner.autoResolveAlerts();

      const alert = await Alert.findOne({ productId: testProduct._id });
      expect(alert.status).toBe("RESOLVED");
    });

    it("should resolve EXPIRING_SOON alert when lot quantity is 0", async () => {
      const lot = await InventoryLot.create(
        createInventoryLotData({
          productId: testProduct._id,
          warehouseId: testWarehouse._id,
          lotNumber: "LOT001",
          quantity: 10,
        })
      );

      await Alert.create({
        alertType: "EXPIRING_SOON",
        severity: "MEDIUM",
        productId: testProduct._id,
        productSku: testProduct.sku,
        productName: testProduct.name,
        inventoryLotId: lot._id,
        lotNumber: "LOT001",
        message: "Expiring soon",
        status: "ACTIVE",
      });

      // Set lot quantity to 0
      lot.quantity = 0;
      await lot.save();

      await inventoryScanner.autoResolveAlerts();

      const alert = await Alert.findOne({ lotNumber: "LOT001" });
      expect(alert.status).toBe("RESOLVED");
    });
  });

  describe("scanInventory (full scan)", () => {
    it("should perform complete inventory scan", async () => {
      // Create low stock product
      await Product.create(
        createProductData({
          sku: "MED001",
          currentStock: 2,
          minimumStock: 10,
        })
      );

      // Create expired lot with product that has stock
      const product2 = await Product.create(
        createProductData({
          sku: "MED002",
          name: "Medicine 2",
          currentStock: 50, // Add stock to avoid OUT_OF_STOCK alert
          minimumStock: 10,
        })
      );
      const warehouse = await Warehouse.create(createWarehouseData());
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 5);

      await InventoryLot.create(
        createInventoryLotData({
          productId: product2._id,
          warehouseId: warehouse._id,
          lotNumber: "LOT001",
          expiryDate: expiredDate,
          quantity: 50,
        })
      );

      const results = await inventoryScanner.scanInventory();

      expect(results.lowStock).toBe(1);
      expect(results.expired).toBe(1);
      expect(results.outOfStock).toBe(0);
      expect(results.totalAlerts).toBe(2);

      const allAlerts = await Alert.find({});
      expect(allAlerts.length).toBe(2);
    });
  });
});
