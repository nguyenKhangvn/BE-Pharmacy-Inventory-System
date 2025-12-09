import { jest } from "@jest/globals";

// Mock models
const mockProduct = {
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};

const mockInventoryLot = {
  aggregate: jest.fn(),
  expiringSoon: jest.fn(),
};

const mockTransaction = {
  aggregate: jest.fn(),
};

const mockAlert = {
  find: jest.fn(),
};

// Mock module imports
jest.unstable_mockModule("../../models/product.model.js", () => ({
  default: mockProduct,
}));

jest.unstable_mockModule("../../models/inventoryLot.model.js", () => ({
  default: mockInventoryLot,
}));

jest.unstable_mockModule("../../models/transaction.model.js", () => ({
  default: mockTransaction,
}));

jest.unstable_mockModule("../../models/index.js", () => ({
  Alert: mockAlert,
}));

// Import controller after mocking
const { getDashboard } = await import(
  "../../controllers/dashboard.controller.js"
);

describe("DashboardController.getDashboard", () => {
  let req, res;

  const mockReq = (query = {}) => ({
    query,
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = mockReq();
    res = mockRes();
  });

  describe("Success Cases", () => {
    it("should return dashboard data successfully", async () => {
      // Mock total products
      mockProduct.countDocuments.mockResolvedValue(150);

      // Mock total stock value
      mockInventoryLot.aggregate.mockResolvedValue([
        { totalValue: 5000000 },
      ]);

      // Mock expiring lots
      mockInventoryLot.expiringSoon.mockResolvedValue([
        { productId: "prod1", daysLeft: 15 },
        { productId: "prod2", daysLeft: 20 },
      ]);

      // Mock low stock products
      mockProduct.aggregate.mockResolvedValue([{ count: 10 }]);

      // Mock transactions for chart
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const dateStr = today.toISOString().split("T")[0];
      mockTransaction.aggregate.mockResolvedValue([
        { _id: { date: dateStr, type: "INBOUND" }, totalQuantity: 100 },
        { _id: { date: dateStr, type: "OUTBOUND" }, totalQuantity: 80 },
      ]);

      // Mock alerts
      const mockAlerts = [
        {
          _id: "alert1",
          alertType: "LOW_STOCK",
          severity: "HIGH",
          message: "Thuốc sắp hết",
          productId: {
            _id: "prod1",
            sku: "SKU001",
            name: "Paracetamol",
            unit: "Viên",
          },
          warehouseId: {
            _id: "wh1",
            name: "Kho A",
          },
          createdAt: new Date(),
        },
      ];

      mockAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAlerts),
      });

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy dữ liệu dashboard thành công",
        data: {
          kpis: {
            totalProducts: 150,
            totalStockValue: 5000000,
            expiringCount: 2,
            lowStockCount: 10,
          },
          chart: expect.arrayContaining([
            expect.objectContaining({
              date: expect.any(String),
              day: expect.any(String),
              inbound: expect.any(Number),
              outbound: expect.any(Number),
            }),
          ]),
          alerts: expect.arrayContaining([
            expect.objectContaining({
              id: "alert1",
              type: "LOW_STOCK",
              severity: "HIGH",
              message: "Thuốc sắp hết",
              product: expect.objectContaining({
                id: "prod1",
                sku: "SKU001",
                name: "Paracetamol",
                unit: "Viên",
              }),
              warehouse: expect.objectContaining({
                id: "wh1",
                name: "Kho A",
              }),
              createdAt: expect.any(Date),
            }),
          ]),
        },
      });

      expect(mockProduct.countDocuments).toHaveBeenCalledWith({
        isActive: true,
      });
      expect(mockInventoryLot.expiringSoon).toHaveBeenCalledWith(30);
      expect(mockAlert.find).toHaveBeenCalledWith({ status: "ACTIVE" });
    });

    it("should handle zero values gracefully", async () => {
      mockProduct.countDocuments.mockResolvedValue(0);
      mockInventoryLot.aggregate.mockResolvedValue([]);
      mockInventoryLot.expiringSoon.mockResolvedValue([]);
      mockProduct.aggregate.mockResolvedValue([]);
      mockTransaction.aggregate.mockResolvedValue([]);
      mockAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy dữ liệu dashboard thành công",
        data: {
          kpis: {
            totalProducts: 0,
            totalStockValue: 0,
            expiringCount: 0,
            lowStockCount: 0,
          },
          chart: expect.any(Array),
          alerts: [],
        },
      });
    });

    it("should return 7 days of chart data", async () => {
      mockProduct.countDocuments.mockResolvedValue(10);
      mockInventoryLot.aggregate.mockResolvedValue([]);
      mockInventoryLot.expiringSoon.mockResolvedValue([]);
      mockProduct.aggregate.mockResolvedValue([]);
      mockTransaction.aggregate.mockResolvedValue([]);
      mockAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.data.chart).toHaveLength(7);
      expect(response.data.chart[0]).toHaveProperty("date");
      expect(response.data.chart[0]).toHaveProperty("day");
      expect(response.data.chart[0]).toHaveProperty("inbound");
      expect(response.data.chart[0]).toHaveProperty("outbound");
    });

    it("should limit alerts to 5 items", async () => {
      mockProduct.countDocuments.mockResolvedValue(10);
      mockInventoryLot.aggregate.mockResolvedValue([]);
      mockInventoryLot.expiringSoon.mockResolvedValue([]);
      mockProduct.aggregate.mockResolvedValue([]);
      mockTransaction.aggregate.mockResolvedValue([]);

      const mockAlerts = Array.from({ length: 5 }, (_, i) => ({
        _id: `alert${i}`,
        alertType: "LOW_STOCK",
        severity: "HIGH",
        message: `Alert ${i}`,
        productId: {
          _id: `prod${i}`,
          sku: `SKU${i}`,
          name: `Product ${i}`,
          unit: "Viên",
        },
        warehouseId: {
          _id: `wh${i}`,
          name: `Kho ${i}`,
        },
        createdAt: new Date(),
      }));

      mockAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockAlerts),
      });

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.data.alerts).toHaveLength(5);
      expect(mockAlert.find().limit).toHaveBeenCalledWith(5);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      mockProduct.countDocuments.mockRejectedValue(
        new Error("Database error")
      );

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          "Lỗi server khi lấy dữ liệu dashboard. Vui lòng thử lại sau.",
        errors: null,
      });
    });

    it("should handle transaction aggregate error", async () => {
      mockProduct.countDocuments.mockResolvedValue(10);
      mockInventoryLot.aggregate.mockResolvedValue([]);
      mockInventoryLot.expiringSoon.mockResolvedValue([]);
      mockProduct.aggregate.mockResolvedValue([]);
      mockTransaction.aggregate.mockRejectedValue(
        new Error("Transaction error")
      );

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          "Lỗi server khi lấy dữ liệu dashboard. Vui lòng thử lại sau.",
        errors: null,
      });
    });

    it("should handle alert fetch error", async () => {
      mockProduct.countDocuments.mockResolvedValue(10);
      mockInventoryLot.aggregate.mockResolvedValue([]);
      mockInventoryLot.expiringSoon.mockResolvedValue([]);
      mockProduct.aggregate.mockResolvedValue([]);
      mockTransaction.aggregate.mockResolvedValue([]);
      mockAlert.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error("Alert error")),
      });

      await getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message:
          "Lỗi server khi lấy dữ liệu dashboard. Vui lòng thử lại sau.",
        errors: null,
      });
    });
  });
});
