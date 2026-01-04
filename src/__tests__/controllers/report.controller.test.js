import { jest } from "@jest/globals";
// Import dependencies
import Transaction from "../../models/transaction.model.js";
import TransactionDetail from "../../models/transactionDetail.model.js";
import Product from "../../models/product.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import mongoose from "mongoose";

// 1. Define a standalone mock function for fs.existsSync
const mockExistsSync = jest.fn();

// 2. Manually mock the 'fs' module using a factory
jest.unstable_mockModule("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    // Add other fs methods here if needed, e.g., readFileSync: jest.fn()
  },
  existsSync: mockExistsSync, // Named export support
}));

// 3. Import the mocked 'fs' module dynamically
// This is crucial for ESM mocking to work correctly with jest.unstable_mockModule
const fs = await import("fs");

// 4. Define mockDoc before mocking pdfkit
const mockDoc = {
  pipe: jest.fn().mockReturnThis(),
  font: jest.fn().mockReturnThis(),
  fontSize: jest.fn().mockReturnThis(),
  text: jest.fn().mockReturnThis(),
  moveDown: jest.fn().mockReturnThis(),
  fillColor: jest.fn().mockReturnThis(),
  rect: jest.fn().mockReturnThis(),
  fill: jest.fn().mockReturnThis(),
  moveTo: jest.fn().mockReturnThis(),
  lineTo: jest.fn().mockReturnThis(),
  lineWidth: jest.fn().mockReturnThis(),
  strokeColor: jest.fn().mockReturnThis(),
  stroke: jest.fn().mockReturnThis(),
  addPage: jest.fn().mockReturnThis(),
  switchToPage: jest.fn().mockReturnThis(),
  registerFont: jest.fn().mockReturnThis(),
  end: jest.fn(),
  y: 100,
  page: { height: 842, width: 595 },
  bufferedPageRange: jest.fn().mockReturnValue({ count: 1 }),
  _currentFont: "Helvetica",
};

// 5. Mock 'pdfkit' module
jest.unstable_mockModule("pdfkit", () => ({
  default: jest.fn().mockImplementation(() => mockDoc),
}));

// 6. Import the controller and PDFDocument AFTER mocking
const { exportReport, getStockSummary, getTrends, getStatusDistribution } =
  await import("../../controllers/report.controller.js");
const PDFDocument = (await import("pdfkit")).default;

// Mock Models (Standard Jest Mocking)
jest.mock("../../models/transaction.model.js");
jest.mock("../../models/transactionDetail.model.js");
jest.mock("../../models/product.model.js");

describe("Report Controller - getStockSummary", () => {
  let req, res;

  beforeEach(() => {
    req = {
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock ApiResponse methods
    ApiResponse.error = jest.fn();
    ApiResponse.success = jest.fn();

    jest.clearAllMocks();
  });

  describe("Input Validation", () => {
    test("should return 400 if startDate is missing", async () => {
      req.query = { endDate: "2024-01-31" };

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if endDate is missing", async () => {
      req.query = { startDate: "2024-01-01" };

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if both dates are missing", async () => {
      req.query = {};

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if startDate format is invalid", async () => {
      req.query = { startDate: "invalid-date", endDate: "2024-01-31" };

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng ngày không hợp lệ",
        400
      );
    });

    test("should return 400 if endDate format is invalid", async () => {
      req.query = { startDate: "2024-01-01", endDate: "not-a-date" };

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng ngày không hợp lệ",
        400
      );
    });

    test("should return 400 if startDate is after endDate", async () => {
      req.query = { startDate: "2024-02-01", endDate: "2024-01-31" };

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "startDate phải nhỏ hơn hoặc bằng endDate",
        400
      );
    });

    test("should accept valid date range", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });
  });

  describe("Stock Summary Calculation", () => {
    beforeEach(() => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };
    });

    test("should return empty list if no products exist", async () => {
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalProducts: 0,
          products: [],
        }),
        "Lấy báo cáo xuất-nhập-tồn thành công",
        200
      );
    });

    test("should calculate stock summary for single product with no activity", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      // Mock aggregate to return no transactions
      TransactionDetail.aggregate = jest.fn().mockResolvedValue([]);

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalProducts: 0, // filtered out - no activity
          products: [],
        }),
        "Lấy báo cáo xuất-nhập-tồn thành công",
        200
      );
    });

    test("should calculate opening stock from transactions before startDate", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      // Mock opening stock calculation (before 2024-01-01)
      // INBOUND: 100, OUTBOUND: 20 => Opening = 80
      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 100 }]) // inbound before start
        .mockResolvedValueOnce([{ totalQuantity: 20 }]) // outbound before start
        .mockResolvedValueOnce([]) // inbound in period
        .mockResolvedValueOnce([]); // outbound in period

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalProducts: 1,
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: mockProduct._id,
              productName: "Paracetamol",
              unit: "viên",
              openingStock: 80,
              totalInbound: 0,
              totalOutbound: 0,
              closingStock: 80,
            }),
          ]),
        }),
        "Lấy báo cáo xuất-nhập-tồn thành công",
        200
      );
    });

    test("should calculate total inbound in date range", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      // Mock: Opening = 50, Inbound in period = 100
      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 50 }]) // inbound before start
        .mockResolvedValueOnce([]) // outbound before start
        .mockResolvedValueOnce([{ totalQuantity: 100 }]) // inbound in period
        .mockResolvedValueOnce([]); // outbound in period

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              openingStock: 50,
              totalInbound: 100,
              totalOutbound: 0,
              closingStock: 150,
            }),
          ]),
        }),
        expect.any(String),
        200
      );
    });

    test("should calculate total outbound in date range", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      // Mock: Opening = 100, Outbound in period = 30
      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 100 }]) // inbound before start
        .mockResolvedValueOnce([]) // outbound before start
        .mockResolvedValueOnce([]) // inbound in period
        .mockResolvedValueOnce([{ totalQuantity: 30 }]); // outbound in period

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              openingStock: 100,
              totalInbound: 0,
              totalOutbound: 30,
              closingStock: 70,
            }),
          ]),
        }),
        expect.any(String),
        200
      );
    });

    test("should calculate closing stock correctly (opening + inbound - outbound)", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      // Opening: 50, Inbound: 200, Outbound: 80 => Closing: 170
      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 50 }]) // inbound before
        .mockResolvedValueOnce([]) // outbound before
        .mockResolvedValueOnce([{ totalQuantity: 200 }]) // inbound in period
        .mockResolvedValueOnce([{ totalQuantity: 80 }]); // outbound in period

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              openingStock: 50,
              totalInbound: 200,
              totalOutbound: 80,
              closingStock: 170,
            }),
          ]),
        }),
        expect.any(String),
        200
      );
    });

    test("should handle multiple products with different stock levels", async () => {
      const mockProducts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: "Paracetamol",
          unit: "viên",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: "Amoxicillin",
          unit: "viên",
        },
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProducts),
        }),
      });

      // WE USE MOCK IMPLEMENTATION TO RETURN DATA BASED ON INPUT
      TransactionDetail.aggregate = jest
        .fn()
        .mockImplementation(async (pipeline) => {
          // 1. Extract the criteria from the pipeline
          const matchStage = pipeline.find((stage) => stage.$match);
          const criteria = matchStage.$match;

          // Convert ObjectId to string for comparison
          const currentProductId = criteria.productId.toString();
          const type = criteria["transaction.type"];
          const dateQuery = criteria["transaction.transactionDate"];

          // Check if this is a "Period" query (has $gte) or "Opening" query (only $lte)
          const isPeriodQuery = dateQuery && dateQuery.$gte !== undefined;

          // --- LOGIC FOR PRODUCT 1 (Paracetamol) ---
          if (currentProductId === mockProducts[0]._id.toString()) {
            if (type === "INBOUND") {
              // Period Inbound: 50, Opening Inbound: 100
              return isPeriodQuery
                ? [{ totalQuantity: 50 }]
                : [{ totalQuantity: 100 }];
            }
            if (type === "OUTBOUND") {
              // Period Outbound: 30, Opening Outbound: 0 (empty)
              return isPeriodQuery ? [{ totalQuantity: 30 }] : [];
            }
          }

          // --- LOGIC FOR PRODUCT 2 (Amoxicillin) ---
          if (currentProductId === mockProducts[1]._id.toString()) {
            if (type === "INBOUND") {
              // Period Inbound: 200, Opening Inbound: 0
              return isPeriodQuery ? [{ totalQuantity: 200 }] : [];
            }
            if (type === "OUTBOUND") {
              return []; // No outbound at all
            }
          }

          return []; // Default fallback
        });

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalProducts: 2,
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: mockProducts[0]._id,
              productName: "Paracetamol",
              // Opening: 100(in)-0(out) = 100
              // Period: 50(in)-30(out)
              // Closing: 100 + 50 - 30 = 120
              closingStock: 120,
            }),
            expect.objectContaining({
              productId: mockProducts[1]._id,
              productName: "Amoxicillin",
              // Opening: 0
              // Period: 200(in)
              // Closing: 200
              closingStock: 200,
            }),
          ]),
        }),
        expect.any(String),
        200
      );
    });

    test("should filter out products with no stock activity", async () => {
      const mockProducts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: "Active Product",
          unit: "viên",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: "Inactive Product",
          unit: "viên",
        },
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProducts),
        }),
      });

      // Product 1: Has activity
      // Product 2: No activity (all zeros)
      TransactionDetail.aggregate = jest
        .fn()
        // Product 1
        .mockResolvedValueOnce([{ totalQuantity: 100 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        // Product 2 - all empty
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalProducts: 1,
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: mockProducts[0]._id,
            }),
          ]),
        }),
        expect.any(String),
        200
      );
    });
  });

  describe("Date Range Handling", () => {
    test("should handle same-day date range", async () => {
      req.query = { startDate: "2024-01-15", endDate: "2024-01-15" };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });

    test("should set time to start of day for startDate", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await getStockSummary(req, res);

      const callArgs = ApiResponse.success.mock.calls[0][1];
      const startDate = callArgs.startDate;

      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);
    });

    test("should set time to end of day for endDate", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await getStockSummary(req, res);

      const callArgs = ApiResponse.success.mock.calls[0][1];
      const endDate = callArgs.endDate;

      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };
    });

    test("should handle database error when fetching products", async () => {
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockRejectedValue(new Error("Database error")),
        }),
      });

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy báo cáo xuất-nhập-tồn",
        500,
        "Database error"
      );
    });

    test("should handle aggregate query failure", async () => {
      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Test",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      TransactionDetail.aggregate = jest
        .fn()
        .mockRejectedValue(new Error("Aggregate failed"));

      await getStockSummary(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy báo cáo xuất-nhập-tồn",
        500,
        "Aggregate failed"
      );
    });
  });

  describe("Response Format", () => {
    test("should return correct response structure", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };

      const mockProduct = {
        _id: new mongoose.Types.ObjectId(),
        name: "Paracetamol",
        unit: "viên",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([mockProduct]),
        }),
      });

      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 50 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ totalQuantity: 100 }])
        .mockResolvedValueOnce([{ totalQuantity: 30 }]);

      await getStockSummary(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          totalProducts: expect.any(Number),
          products: expect.arrayContaining([
            expect.objectContaining({
              productId: expect.any(Object), // ObjectId is an object
              productName: expect.any(String),
              unit: expect.any(String),
              openingStock: expect.any(Number),
              totalInbound: expect.any(Number),
              totalOutbound: expect.any(Number),
              closingStock: expect.any(Number),
            }),
          ]),
        }),
        "Lấy báo cáo xuất-nhập-tồn thành công",
        200
      );
    });
  });
});

describe("Report Controller - getTrends", () => {
  let req, res;

  beforeEach(() => {
    req = {
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock ApiResponse methods
    ApiResponse.error = jest.fn();
    ApiResponse.success = jest.fn();

    jest.clearAllMocks();
  });

  describe("Input Validation", () => {
    test("should return 400 if startDate is missing", async () => {
      req.query = { endDate: "2024-12-31" };

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if endDate is missing", async () => {
      req.query = { startDate: "2024-01-01" };

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if both dates are missing", async () => {
      req.query = {};

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Vui lòng cung cấp startDate và endDate",
        400
      );
    });

    test("should return 400 if startDate format is invalid", async () => {
      req.query = { startDate: "invalid-date", endDate: "2024-12-31" };

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng ngày không hợp lệ",
        400
      );
    });

    test("should return 400 if endDate format is invalid", async () => {
      req.query = { startDate: "2024-01-01", endDate: "not-a-date" };

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng ngày không hợp lệ",
        400
      );
    });

    test("should return 400 if startDate is after endDate", async () => {
      req.query = { startDate: "2024-12-01", endDate: "2024-01-31" };

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "startDate phải nhỏ hơn hoặc bằng endDate",
        400
      );
    });

    test("should accept valid date range", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });
  });

  describe("Trends Calculation", () => {
    beforeEach(() => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };
    });

    test("should return empty trends if no transactions exist", async () => {
      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalMonths: 0,
          trends: [],
        }),
        "Lấy dữ liệu biểu đồ thành công",
        200
      );
    });

    test("should calculate inbound trends correctly", async () => {
      const mockInboundData = [
        {
          year: 2024,
          month: 1,
          totalQuantity: 500,
          totalValue: 5000000,
          transactionCount: 5,
        },
        {
          year: 2024,
          month: 2,
          totalQuantity: 300,
          totalValue: 3000000,
          transactionCount: 3,
        },
      ];

      // First call for INBOUND, second for OUTBOUND
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce(mockInboundData)
        .mockResolvedValueOnce([]);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalMonths: 2,
          trends: expect.arrayContaining([
            expect.objectContaining({
              year: 2024,
              month: 1,
              inbound: {
                totalQuantity: 500,
                totalValue: 5000000,
                transactionCount: 5,
              },
              outbound: {
                totalQuantity: 0,
                totalValue: 0,
                transactionCount: 0,
              },
            }),
            expect.objectContaining({
              year: 2024,
              month: 2,
              inbound: {
                totalQuantity: 300,
                totalValue: 3000000,
                transactionCount: 3,
              },
              outbound: {
                totalQuantity: 0,
                totalValue: 0,
                transactionCount: 0,
              },
            }),
          ]),
        }),
        "Lấy dữ liệu biểu đồ thành công",
        200
      );
    });

    test("should calculate outbound trends correctly", async () => {
      const mockOutboundData = [
        {
          year: 2024,
          month: 1,
          totalQuantity: 200,
          totalValue: 2000000,
          transactionCount: 2,
        },
      ];

      // First call for INBOUND (empty), second for OUTBOUND
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockOutboundData);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalMonths: 1,
          trends: expect.arrayContaining([
            expect.objectContaining({
              year: 2024,
              month: 1,
              inbound: {
                totalQuantity: 0,
                totalValue: 0,
                transactionCount: 0,
              },
              outbound: {
                totalQuantity: 200,
                totalValue: 2000000,
                transactionCount: 2,
              },
            }),
          ]),
        }),
        "Lấy dữ liệu biểu đồ thành công",
        200
      );
    });

    test("should merge inbound and outbound trends for same month", async () => {
      const mockInboundData = [
        {
          year: 2024,
          month: 3,
          totalQuantity: 600,
          totalValue: 6000000,
          transactionCount: 6,
        },
      ];

      const mockOutboundData = [
        {
          year: 2024,
          month: 3,
          totalQuantity: 400,
          totalValue: 4000000,
          transactionCount: 4,
        },
      ];

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce(mockInboundData)
        .mockResolvedValueOnce(mockOutboundData);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          totalMonths: 1,
          trends: expect.arrayContaining([
            expect.objectContaining({
              year: 2024,
              month: 3,
              inbound: {
                totalQuantity: 600,
                totalValue: 6000000,
                transactionCount: 6,
              },
              outbound: {
                totalQuantity: 400,
                totalValue: 4000000,
                transactionCount: 4,
              },
            }),
          ]),
        }),
        "Lấy dữ liệu biểu đồ thành công",
        200
      );
    });

    test("should handle multiple months with mixed data", async () => {
      const mockInboundData = [
        {
          year: 2024,
          month: 1,
          totalQuantity: 100,
          totalValue: 1000000,
          transactionCount: 1,
        },
        {
          year: 2024,
          month: 3,
          totalQuantity: 300,
          totalValue: 3000000,
          transactionCount: 3,
        },
      ];

      const mockOutboundData = [
        {
          year: 2024,
          month: 2,
          totalQuantity: 200,
          totalValue: 2000000,
          transactionCount: 2,
        },
        {
          year: 2024,
          month: 3,
          totalQuantity: 150,
          totalValue: 1500000,
          transactionCount: 1,
        },
      ];

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce(mockInboundData)
        .mockResolvedValueOnce(mockOutboundData);

      await getTrends(req, res);

      const successCall = ApiResponse.success.mock.calls[0];
      const responseData = successCall[1];

      expect(responseData.totalMonths).toBe(3);
      expect(responseData.trends).toHaveLength(3);

      // Check sorting by year and month
      expect(responseData.trends[0].month).toBe(1);
      expect(responseData.trends[1].month).toBe(2);
      expect(responseData.trends[2].month).toBe(3);

      // Month 1: only inbound
      expect(responseData.trends[0].inbound.totalQuantity).toBe(100);
      expect(responseData.trends[0].outbound.totalQuantity).toBe(0);

      // Month 2: only outbound
      expect(responseData.trends[1].inbound.totalQuantity).toBe(0);
      expect(responseData.trends[1].outbound.totalQuantity).toBe(200);

      // Month 3: both inbound and outbound
      expect(responseData.trends[2].inbound.totalQuantity).toBe(300);
      expect(responseData.trends[2].outbound.totalQuantity).toBe(150);
    });

    test("should sort trends by year and month", async () => {
      const mockInboundData = [
        {
          year: 2024,
          month: 12,
          totalQuantity: 100,
          totalValue: 1000000,
          transactionCount: 1,
        },
        {
          year: 2024,
          month: 1,
          totalQuantity: 200,
          totalValue: 2000000,
          transactionCount: 2,
        },
        {
          year: 2023,
          month: 12,
          totalQuantity: 300,
          totalValue: 3000000,
          transactionCount: 3,
        },
      ];

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce(mockInboundData)
        .mockResolvedValueOnce([]);

      await getTrends(req, res);

      const successCall = ApiResponse.success.mock.calls[0];
      const responseData = successCall[1];

      // Should be sorted: 2023-12, 2024-01, 2024-12
      expect(responseData.trends[0].year).toBe(2023);
      expect(responseData.trends[0].month).toBe(12);

      expect(responseData.trends[1].year).toBe(2024);
      expect(responseData.trends[1].month).toBe(1);

      expect(responseData.trends[2].year).toBe(2024);
      expect(responseData.trends[2].month).toBe(12);
    });
  });

  describe("Date Range Handling", () => {
    test("should handle same-day date range", async () => {
      req.query = { startDate: "2024-06-15", endDate: "2024-06-15" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });

    test("should set time to start of day for startDate", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getTrends(req, res);

      const callArgs = ApiResponse.success.mock.calls[0][1];
      const startDate = callArgs.startDate;

      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);
    });

    test("should set time to end of day for endDate", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getTrends(req, res);

      const callArgs = ApiResponse.success.mock.calls[0][1];
      const endDate = callArgs.endDate;

      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };
    });

    test("should handle database error during aggregation", async () => {
      Transaction.aggregate = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy dữ liệu biểu đồ",
        500,
        "Database connection failed"
      );
    });

    test("should handle aggregate query failure for outbound", async () => {
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce([]) // inbound succeeds
        .mockRejectedValue(new Error("Outbound query failed")); // outbound fails

      await getTrends(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy dữ liệu biểu đồ",
        500,
        "Outbound query failed"
      );
    });
  });

  describe("Response Format", () => {
    test("should return correct response structure", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      const mockData = [
        {
          year: 2024,
          month: 6,
          totalQuantity: 500,
          totalValue: 5000000,
          transactionCount: 5,
        },
      ];

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce(mockData)
        .mockResolvedValueOnce(mockData);

      await getTrends(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          totalMonths: expect.any(Number),
          trends: expect.arrayContaining([
            expect.objectContaining({
              year: expect.any(Number),
              month: expect.any(Number),
              inbound: expect.objectContaining({
                totalQuantity: expect.any(Number),
                totalValue: expect.any(Number),
                transactionCount: expect.any(Number),
              }),
              outbound: expect.objectContaining({
                totalQuantity: expect.any(Number),
                totalValue: expect.any(Number),
                transactionCount: expect.any(Number),
              }),
            }),
          ]),
        }),
        "Lấy dữ liệu biểu đồ thành công",
        200
      );
    });
  });
});

describe("Report Controller - getStatusDistribution", () => {
  let req, res;

  beforeEach(() => {
    req = {
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Mock ApiResponse methods
    ApiResponse.error = jest.fn();
    ApiResponse.success = jest.fn();

    jest.clearAllMocks();
  });

  describe("Input Validation", () => {
    test("should return 400 if startDate format is invalid", async () => {
      req.query = { startDate: "invalid-date" };

      await getStatusDistribution(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng startDate không hợp lệ",
        400
      );
    });

    test("should return 400 if endDate format is invalid", async () => {
      req.query = { endDate: "invalid-date" };

      await getStatusDistribution(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Định dạng endDate không hợp lệ",
        400
      );
    });

    test("should return 400 if startDate is after endDate", async () => {
      req.query = { startDate: "2024-12-31", endDate: "2024-01-01" };

      await getStatusDistribution(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "startDate phải nhỏ hơn hoặc bằng endDate",
        400
      );
    });

    test("should accept valid date range", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });

    test("should work without date parameters", async () => {
      req.query = {};

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });

    test("should work with only startDate", async () => {
      req.query = { startDate: "2024-01-01" };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });

    test("should work with only endDate", async () => {
      req.query = { endDate: "2024-12-31" };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalled();
    });
  });

  describe("Status Distribution Calculation", () => {
    test("should correctly calculate distribution for single status", async () => {
      req.query = {};

      const mockData = [{ status: "COMPLETED", count: 50 }];

      Transaction.aggregate = jest.fn().mockResolvedValue(mockData);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        {
          startDate: null,
          endDate: null,
          totalTransactions: 50,
          distribution: [
            {
              status: "COMPLETED",
              count: 50,
              percentage: 100,
            },
          ],
        },
        "Lấy phân bổ trạng thái thành công",
        200
      );
    });

    test("should correctly calculate distribution for multiple statuses", async () => {
      req.query = {};

      const mockData = [
        { status: "COMPLETED", count: 60 },
        { status: "DRAFT", count: 30 },
        { status: "CANCELED", count: 10 },
      ];

      Transaction.aggregate = jest.fn().mockResolvedValue(mockData);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        {
          startDate: null,
          endDate: null,
          totalTransactions: 100,
          distribution: [
            {
              status: "COMPLETED",
              count: 60,
              percentage: 60,
            },
            {
              status: "DRAFT",
              count: 30,
              percentage: 30,
            },
            {
              status: "CANCELED",
              count: 10,
              percentage: 10,
            },
          ],
        },
        "Lấy phân bổ trạng thái thành công",
        200
      );
    });

    test("should handle empty result", async () => {
      req.query = {};

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        {
          startDate: null,
          endDate: null,
          totalTransactions: 0,
          distribution: [],
        },
        "Lấy phân bổ trạng thái thành công",
        200
      );
    });

    test("should round percentages to 2 decimal places", async () => {
      req.query = {};

      const mockData = [
        { status: "COMPLETED", count: 33 },
        { status: "DRAFT", count: 33 },
        { status: "CANCELED", count: 34 },
      ];

      Transaction.aggregate = jest.fn().mockResolvedValue(mockData);

      await getStatusDistribution(req, res);

      const result = ApiResponse.success.mock.calls[0][1];
      expect(result.distribution[0].percentage).toBe(33);
      expect(result.distribution[1].percentage).toBe(33);
      expect(result.distribution[2].percentage).toBe(34);
    });

    test("should calculate correct percentages with decimal precision", async () => {
      req.query = {};

      const mockData = [
        { status: "COMPLETED", count: 7 },
        { status: "DRAFT", count: 3 },
      ];

      Transaction.aggregate = jest.fn().mockResolvedValue(mockData);

      await getStatusDistribution(req, res);

      const result = ApiResponse.success.mock.calls[0][1];
      expect(result.distribution[0].percentage).toBe(70);
      expect(result.distribution[1].percentage).toBe(30);
    });
  });

  describe("Date Range Filtering", () => {
    test("should apply date range filter correctly", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-01-31" };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await getStatusDistribution(req, res);

      expect(Transaction.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            transactionDate: {
              $gte: expect.any(Date),
              $lte: expect.any(Date),
            },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            status: "$_id",
            count: 1,
          },
        },
        { $sort: { status: 1 } },
      ]);
    });

    test("should normalize start date to beginning of day", async () => {
      req.query = { startDate: "2024-01-15" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getStatusDistribution(req, res);

      const matchStage = Transaction.aggregate.mock.calls[0][0][0].$match;
      const startDate = matchStage.transactionDate.$gte;
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);
      expect(startDate.getMilliseconds()).toBe(0);
    });

    test("should normalize end date to end of day", async () => {
      req.query = { endDate: "2024-01-15" };

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getStatusDistribution(req, res);

      const matchStage = Transaction.aggregate.mock.calls[0][0][0].$match;
      const endDate = matchStage.transactionDate.$lte;
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
      expect(endDate.getSeconds()).toBe(59);
      expect(endDate.getMilliseconds()).toBe(999);
    });

    test("should not include date filter when no dates provided", async () => {
      req.query = {};

      Transaction.aggregate = jest.fn().mockResolvedValue([]);

      await getStatusDistribution(req, res);

      const matchStage = Transaction.aggregate.mock.calls[0][0][0].$match;
      expect(matchStage).toEqual({});
    });
  });

  describe("Error Handling", () => {
    test("should handle database errors", async () => {
      req.query = {};

      const dbError = new Error("Database connection failed");
      Transaction.aggregate = jest.fn().mockRejectedValue(dbError);

      await getStatusDistribution(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy phân bổ trạng thái",
        500,
        dbError.message
      );
    });

    test("should handle aggregate pipeline errors", async () => {
      req.query = {};

      const pipelineError = new Error("Invalid pipeline stage");
      Transaction.aggregate = jest.fn().mockRejectedValue(pipelineError);

      await getStatusDistribution(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi lấy phân bổ trạng thái",
        500,
        pipelineError.message
      );
    });
  });

  describe("Response Format", () => {
    test("should return correct response format", async () => {
      req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

      const mockData = [
        { status: "COMPLETED", count: 50 },
        { status: "DRAFT", count: 30 },
      ];

      Transaction.aggregate = jest.fn().mockResolvedValue(mockData);

      await getStatusDistribution(req, res);

      expect(ApiResponse.success).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          totalTransactions: expect.any(Number),
          distribution: expect.arrayContaining([
            expect.objectContaining({
              status: expect.any(String),
              count: expect.any(Number),
              percentage: expect.any(Number),
            }),
          ]),
        }),
        "Lấy phân bổ trạng thái thành công",
        200
      );
    });
  });
});

describe("Report Controller - exportReport", () => {
  let req, res;

  beforeEach(() => {
    req = {
      query: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      headersSent: false,
      // Mock stream methods for pipe()
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    // Mock ApiResponse methods
    ApiResponse.error = jest.fn();
    ApiResponse.success = jest.fn();

    // Reset all mocks
    jest.clearAllMocks();

    // Reset implementation mặc định cho fs.existsSync
    // Mặc định giả lập là file font CÓ tồn tại
    mockExistsSync.mockReturnValue(true);
  });

  describe("Input Validation", () => {
    test("should return 400 if type is missing", async () => {
      req.query = { reportType: "stock_summary" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Loại file không hợp lệ. Chỉ hỗ trợ type=pdf",
        400
      );
    });

    test("should return 400 if type is not pdf", async () => {
      req.query = { type: "excel", reportType: "stock_summary" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Loại file không hợp lệ. Chỉ hỗ trợ type=pdf",
        400
      );
    });

    test("should return 400 if reportType is missing", async () => {
      req.query = { type: "pdf" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        expect.stringContaining("Loại báo cáo không hợp lệ"),
        400
      );
    });

    test("should return 400 if reportType is invalid", async () => {
      req.query = { type: "pdf", reportType: "invalid_type" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        expect.stringContaining("Loại báo cáo không hợp lệ"),
        400
      );
    });

    test("should return 400 if stock_summary requires startDate and endDate", async () => {
      req.query = { type: "pdf", reportType: "stock_summary" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Báo cáo xuất-nhập-tồn yêu cầu startDate và endDate",
        400
      );
    });

    test("should return 400 if trends requires startDate and endDate", async () => {
      req.query = { type: "pdf", reportType: "trends" };

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Báo cáo xu hướng yêu cầu startDate và endDate",
        400
      );
    });

    test("should accept valid parameters", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock aggregate success
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
    });
  });

  describe("PDF Generation - Stock Summary", () => {
    test("should generate PDF for stock_summary report", async () => {
      req.query = {
        type: "pdf",
        reportType: "stock_summary",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      };

      const mockProducts = [
        { _id: new mongoose.Types.ObjectId(), name: "Product 1", unit: "Box" },
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProducts),
        }),
      });

      // Mock 4 aggregate calls: opening inbound, opening outbound, period inbound, period outbound
      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ totalQuantity: 50 }]) // opening stock inbound
        .mockResolvedValueOnce([]) // opening stock outbound
        .mockResolvedValueOnce([{ totalQuantity: 100 }]) // period inbound
        .mockResolvedValueOnce([{ totalQuantity: 30 }]); // period outbound

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringContaining("attachment; filename=report_stock_summary_")
      );
      expect(mockDoc.pipe).toHaveBeenCalledWith(res);
      expect(mockDoc.end).toHaveBeenCalled();
    });

    test("should register custom fonts if available", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Giả lập file font tồn tại
      mockExistsSync.mockReturnValue(true);

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.registerFont).toHaveBeenCalledWith(
        "Roboto-Regular",
        expect.stringContaining("Roboto-Regular.ttf")
      );
      expect(mockDoc.registerFont).toHaveBeenCalledWith(
        "Roboto-Bold",
        expect.stringContaining("Roboto-Bold.ttf")
      );
    });

    test("should fallback to Helvetica if fonts not found", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Giả lập file font KHÔNG tồn tại
      mockExistsSync.mockReturnValue(false);

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await exportReport(req, res);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Không tìm thấy file font Roboto")
      );
      expect(mockDoc.font).toHaveBeenCalledWith("Helvetica");

      consoleSpy.mockRestore();
    });
  });

  describe("PDF Generation - Trends", () => {
    test("should generate PDF for trends report", async () => {
      req.query = {
        type: "pdf",
        reportType: "trends",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      // Mock 2 lần gọi aggregate (inbound và outbound)
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce([
          {
            year: 2024,
            month: 1,
            totalQuantity: 100,
            totalValue: 1000000,
            transactionCount: 5,
          },
        ])
        .mockResolvedValueOnce([
          {
            year: 2024,
            month: 1,
            totalQuantity: 50,
            totalValue: 500000,
            transactionCount: 3,
          },
        ]);

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringContaining("attachment; filename=report_trends_")
      );
      expect(mockDoc.end).toHaveBeenCalled();
    });
  });

  describe("PDF Generation - Status Distribution", () => {
    test("should generate PDF for status_distribution report", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      Transaction.aggregate = jest.fn().mockResolvedValue([
        { status: "COMPLETED", count: 60 },
        { status: "DRAFT", count: 30 },
        { status: "CANCELED", count: 10 },
      ]);

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringContaining(
          "attachment; filename=report_status_distribution_"
        )
      );
      expect(mockDoc.end).toHaveBeenCalled();
    });

    test("should work without date parameters for status_distribution", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.end).toHaveBeenCalled();
    });
  });

  describe("PDF Content Generation", () => {
    test("should call font methods for title", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.font).toHaveBeenCalledWith("Roboto-Bold");
      expect(mockDoc.fontSize).toHaveBeenCalled();
      expect(mockDoc.text).toHaveBeenCalled();
    });

    test("should include date range in PDF when provided", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.text).toHaveBeenCalledWith(
        expect.stringContaining("Từ ngày:"),
        expect.any(Object)
      );
    });

    test("should generate page numbers in footer", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.bufferedPageRange).toHaveBeenCalled();
      expect(mockDoc.switchToPage).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should handle database errors during data fetching", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      const dbError = new Error("DB Error");
      Transaction.aggregate = jest.fn().mockRejectedValue(dbError);

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi xuất báo cáo",
        500,
        "DB Error"
      );
    });

    test("should handle invalid date format", async () => {
      req.query = {
        type: "pdf",
        reportType: "stock_summary",
        startDate: "invalid-date",
        endDate: "2024-12-31",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      await exportReport(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Lỗi khi xuất báo cáo",
        500,
        expect.any(String)
      );
    });

    test("should not send error if headers already sent", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      res.headersSent = true;
      const dbError = new Error("Error during PDF generation");
      Transaction.aggregate = jest.fn().mockRejectedValue(dbError);

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await exportReport(req, res);

      expect(ApiResponse.error).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in exportReport:",
        dbError
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Response Headers", () => {
    test("should set correct Content-Type header", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
    });

    test("should set correct Content-Disposition with filename", async () => {
      req.query = {
        type: "pdf",
        reportType: "trends",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      Transaction.aggregate = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringMatching(/^attachment; filename=report_trends_\d+\.pdf$/)
      );
    });
  });

  describe("PDF Document Configuration", () => {
    test("should initialize PDFDocument with correct options", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      // PDFDocument constructor is already mocked, check instance creation
      expect(mockDoc.pipe).toHaveBeenCalledWith(res);
    });

    test("should pipe PDF to response stream", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.pipe).toHaveBeenCalledWith(res);
    });

    test("should finalize PDF document", async () => {
      req.query = {
        type: "pdf",
        reportType: "status_distribution",
      };

      // Mock status_distribution data fetch
      Transaction.aggregate = jest
        .fn()
        .mockResolvedValue([{ status: "COMPLETED", count: 10 }]);

      await exportReport(req, res);

      expect(mockDoc.end).toHaveBeenCalled();
    });
  });
});

describe("Report Controller - exportReportFile (Excel/PDF Export)", () => {
  let req, res;

  beforeEach(() => {
    req = {
      query: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn(),
      write: jest.fn((chunk, callback) => {
        if (callback) callback();
        return true;
      }),
    };

    // Mock ApiResponse methods
    ApiResponse.error = jest.fn();
    ApiResponse.badRequest = jest.fn();

    jest.clearAllMocks();
  });

  describe("Input Validation", () => {
    test("should return 400 if type is invalid", async () => {
      req.query = { type: "invalid" };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(ApiResponse.badRequest).toHaveBeenCalledWith(
        res,
        "Invalid export type. Use 'excel' or 'pdf'"
      );
    });

    test("should return 400 if startDate format is invalid", async () => {
      req.query = {
        type: "excel",
        startDate: "2024/01/01",
        endDate: "2024-12-31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(ApiResponse.badRequest).toHaveBeenCalledWith(
        res,
        "Invalid startDate format (YYYY-MM-DD)"
      );
    });

    test("should return 400 if endDate format is invalid", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024/12/31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(ApiResponse.badRequest).toHaveBeenCalledWith(
        res,
        "Invalid endDate format (YYYY-MM-DD)"
      );
    });

    test("should return 400 if startDate is after endDate", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-12-31",
        endDate: "2024-01-01",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(ApiResponse.badRequest).toHaveBeenCalledWith(
        res,
        "startDate must be before endDate"
      );
    });

    test("should accept valid dates", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      // Mock database calls
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: "507f1f77bcf86cd799439011",
              name: "Product 1",
              unit: "Viên",
            },
          ]),
        }),
      });

      Product.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: "Product 1",
          averageCost: 10000,
          minimumStock: 10,
          reorderLevel: 50,
        }),
      });

      TransactionDetail.aggregate = jest.fn().mockResolvedValue([]);
      Transaction.aggregate = jest.fn().mockResolvedValue([]);
      Transaction.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      // expect(res.setHeader).toHaveBeenCalledWith(
      //   "Content-Type",
      //   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      // );
    });
  });

  // describe("Excel Export", () => {
  //   beforeEach(() => {
  //     // Mock database calls with sample data
  //     Product.find = jest.fn().mockReturnValue({
  //       select: jest.fn().mockReturnValue({
  //         lean: jest.fn().mockResolvedValue([
  //           {
  //             _id: "507f1f77bcf86cd799439011",
  //             name: "Paracetamol",
  //             unit: "Viên",
  //           },
  //           {
  //             _id: "507f1f77bcf86cd799439012",
  //             name: "Amoxicillin",
  //             unit: "Viên",
  //           },
  //         ]),
  //       }),
  //     });

  //     Product.findOne = jest.fn().mockReturnValue({
  //       lean: jest.fn().mockResolvedValue({
  //         name: "Paracetamol",
  //         averageCost: 5000,
  //         minimumStock: 100,
  //         reorderLevel: 200,
  //       }),
  //     });

  //     TransactionDetail.aggregate = jest
  //       .fn()
  //       .mockResolvedValue([{ totalQuantity: 500 }]);

  //     Transaction.aggregate = jest.fn().mockResolvedValue([
  //       {
  //         year: 2024,
  //         month: 1,
  //         totalQuantity: 500,
  //         totalValue: 2500000,
  //         transactionCount: 5,
  //       },
  //     ]);

  //     Transaction.find = jest.fn().mockReturnValue({
  //       lean: jest.fn().mockResolvedValue([
  //         {
  //           _id: "txn1",
  //           type: "INBOUND",
  //           createdAt: new Date("2024-01-15"),
  //           status: "COMPLETED",
  //         },
  //       ]),
  //     });
  //   });

  //   // test("should export Excel file with default type", async () => {
  //   //   req.query = { startDate: "2024-01-01", endDate: "2024-12-31" };

  //   //   const { exportReportFile } = await import(
  //   //     "../../controllers/report.controller.js"
  //   //   );
  //   //   await exportReportFile(req, res);

  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Type",
  //   //     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  //   //   );
  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Disposition",
  //   //     expect.stringContaining("attachment; filename=")
  //   //   );
  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Disposition",
  //   //     expect.stringContaining(".xlsx")
  //   //   );
  //   // });

  //   // test("should export Excel file when type=excel", async () => {
  //   //   req.query = {
  //   //     type: "excel",
  //   //     startDate: "2024-01-01",
  //   //     endDate: "2024-12-31",
  //   //   };

  //   //   const { exportReportFile } = await import(
  //   //     "../../controllers/report.controller.js"
  //   //   );
  //   //   await exportReportFile(req, res);

  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Type",
  //   //     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  //   //   );
  //   // });

  //   // test("should work without date parameters", async () => {
  //   //   req.query = { type: "excel" };

  //   //   const { exportReportFile } = await import(
  //   //     "../../controllers/report.controller.js"
  //   //   );
  //   //   await exportReportFile(req, res);

  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Type",
  //   //     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  //   //   );
  //   // });

  //   // test("should set correct filename with current date", async () => {
  //   //   req.query = {
  //   //     type: "excel",
  //   //     startDate: "2024-01-01",
  //   //     endDate: "2024-12-31",
  //   //   };

  //   //   const { exportReportFile } = await import(
  //   //     "../../controllers/report.controller.js"
  //   //   );
  //   //   await exportReportFile(req, res);

  //   //   const today = new Date().toISOString().split("T")[0];
  //   //   expect(res.setHeader).toHaveBeenCalledWith(
  //   //     "Content-Disposition",
  //   //     `attachment; filename="Bao_Cao_Ton_Kho_${today}.xlsx"`
  //   //   );
  //   // });

  //   // test("should call res.end() after writing Excel", async () => {
  //   //   req.query = {
  //   //     type: "excel",
  //   //     startDate: "2024-01-01",
  //   //     endDate: "2024-12-31",
  //   //   };

  //   //   const { exportReportFile } = await import(
  //   //     "../../controllers/report.controller.js"
  //   //   );
  //   //   await exportReportFile(req, res);

  //   //   expect(res.end).toHaveBeenCalled();
  //   // });
  // });

  describe("PDF Export", () => {
    beforeEach(() => {
      // Mock database calls
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: "507f1f77bcf86cd799439011",
              name: "Paracetamol",
              unit: "Viên",
            },
          ]),
        }),
      });

      Product.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: "Paracetamol",
          averageCost: 5000,
          minimumStock: 100,
          reorderLevel: 200,
        }),
      });

      TransactionDetail.aggregate = jest
        .fn()
        .mockResolvedValue([{ totalQuantity: 500 }]);

      Transaction.aggregate = jest.fn().mockResolvedValue([]);
      Transaction.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      // Mock fs.existsSync
      mockExistsSync.mockReturnValue(true);
    });

    test("should export PDF file when type=pdf", async () => {
      req.query = {
        type: "pdf",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/pdf"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        expect.stringContaining(".pdf")
      );
    });

    test("should register fonts if font files exist", async () => {
      req.query = {
        type: "pdf",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };
      mockExistsSync.mockReturnValue(true);

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(mockDoc.registerFont).toHaveBeenCalled();
    });

    test("should use default font if font files do not exist", async () => {
      req.query = {
        type: "pdf",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };
      mockExistsSync.mockReturnValue(false);

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(mockDoc.font).toHaveBeenCalledWith("Helvetica-Bold");
    });

    test("should call doc.end() after PDF generation", async () => {
      req.query = {
        type: "pdf",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(mockDoc.end).toHaveBeenCalled();
    });
  });

  describe("Data Processing", () => {
    beforeEach(() => {
      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: "507f1f77bcf86cd799439011",
              name: "Product A",
              unit: "Viên",
            },
            { _id: "507f1f77bcf86cd799439012", name: "Product B", unit: "Hộp" },
          ]),
        }),
      });

      TransactionDetail.aggregate = jest.fn().mockImplementation((pipeline) => {
        const matchStage = pipeline.find((stage) => stage.$match);
        if (matchStage && matchStage.$match["transaction.type"] === "INBOUND") {
          return Promise.resolve([{ totalQuantity: 1000 }]);
        }
        if (
          matchStage &&
          matchStage.$match["transaction.type"] === "OUTBOUND"
        ) {
          return Promise.resolve([{ totalQuantity: 300 }]);
        }
        return Promise.resolve([]);
      });

      Product.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: "Product A",
          averageCost: 10000,
          minimumStock: 50,
          reorderLevel: 100,
        }),
      });

      Transaction.aggregate = jest.fn().mockResolvedValue([]);
      Transaction.find = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });
    });

    test("should calculate stock data correctly", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(Product.find).toHaveBeenCalled();
      expect(TransactionDetail.aggregate).toHaveBeenCalled();
    });

    test("should enhance products with value and status", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(Product.findOne).toHaveBeenCalled();
    });

    test("should determine status based on stock levels", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      Product.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: "Product A",
          averageCost: 5000,
          minimumStock: 100,
          reorderLevel: 200,
        }),
      });

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(Product.findOne).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should handle database errors gracefully", async () => {
      req.query = {
        type: "excel",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockRejectedValue(new Error("Database error")),
        }),
      });

      const { exportReportFile } = await import(
        "../../controllers/report.controller.js"
      );
      await exportReportFile(req, res);

      expect(ApiResponse.error).toHaveBeenCalledWith(
        res,
        "Error exporting report",
        500,
        "Database error"
      );
    });

    // test("should handle product not found", async () => {
    //   req.query = {
    //     type: "excel",
    //     startDate: "2024-01-01",
    //     endDate: "2024-12-31",
    //   };

    //   Product.find = jest.fn().mockReturnValue({
    //     select: jest.fn().mockReturnValue({
    //       lean: jest.fn().mockResolvedValue([
    //         {
    //           _id: "507f1f77bcf86cd799439011",
    //           name: "Product A",
    //           unit: "Viên",
    //         },
    //       ]),
    //     }),
    //   });

    //   Product.findOne = jest.fn().mockReturnValue({
    //     lean: jest.fn().mockResolvedValue(null),
    //   });

    //   TransactionDetail.aggregate = jest
    //     .fn()
    //     .mockResolvedValue([{ totalQuantity: 100 }]);

    //   Transaction.aggregate = jest.fn().mockResolvedValue([]);
    //   Transaction.find = jest.fn().mockReturnValue({
    //     lean: jest.fn().mockResolvedValue([]),
    //   });

    //   const { exportReportFile } = await import(
    //     "../../controllers/report.controller.js"
    //   );
    //   await exportReportFile(req, res);

    //   // Should not throw error, should use default values
    //   expect(res.setHeader).toHaveBeenCalled();
    // });
  });

  describe("Integration Tests", () => {
    // test("should generate complete Excel report with all sheets", async () => {
    //   req.query = {
    //     type: "excel",
    //     startDate: "2024-01-01",
    //     endDate: "2024-12-31",
    //   };
    //   Product.find = jest.fn().mockReturnValue({
    //     select: jest.fn().mockReturnValue({
    //       lean: jest.fn().mockResolvedValue([
    //         {
    //           _id: "507f1f77bcf86cd799439011",
    //           name: "Paracetamol",
    //           unit: "Viên",
    //         },
    //       ]),
    //     }),
    //   });
    //   Product.findOne = jest.fn().mockReturnValue({
    //     lean: jest.fn().mockResolvedValue({
    //       name: "Paracetamol",
    //       averageCost: 5000,
    //       minimumStock: 100,
    //       reorderLevel: 200,
    //     }),
    //   });
    //   TransactionDetail.aggregate = jest
    //     .fn()
    //     .mockResolvedValue([{ totalQuantity: 1000 }]);
    //   Transaction.aggregate = jest.fn().mockResolvedValue([
    //     {
    //       year: 2024,
    //       month: 1,
    //       totalQuantity: 500,
    //       totalValue: 2500000,
    //       transactionCount: 5,
    //     },
    //   ]);
    //   Transaction.find = jest.fn().mockReturnValue({
    //     lean: jest.fn().mockResolvedValue([
    //       {
    //         _id: "txn1",
    //         type: "INBOUND",
    //         createdAt: new Date("2024-01-15"),
    //         status: "COMPLETED",
    //       },
    //     ]),
    //   });
    //   const { exportReportFile } = await import(
    //     "../../controllers/report.controller.js"
    //   );
    //   await exportReportFile(req, res);
    //   expect(res.setHeader).toHaveBeenCalledWith(
    //     "Content-Type",
    //     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    //   );
    //   expect(res.end).toHaveBeenCalled();
    // });
  });
});
