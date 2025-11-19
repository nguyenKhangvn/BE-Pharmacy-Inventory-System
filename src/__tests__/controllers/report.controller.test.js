import { jest } from "@jest/globals";
import { getStockSummary } from "../../controllers/report.controller.js";
import Transaction from "../../models/transaction.model.js";
import TransactionDetail from "../../models/transactionDetail.model.js";
import Product from "../../models/product.model.js";
import InventoryLot from "../../models/inventoryLot.model.js";
import ApiResponse from "../../utils/ApiResponse.js";
import mongoose from "mongoose";

// Mock models
jest.mock("../../models/transaction.model.js");
jest.mock("../../models/transactionDetail.model.js");
jest.mock("../../models/product.model.js");
jest.mock("../../models/inventoryLot.model.js");

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
        { _id: new mongoose.Types.ObjectId(), name: "Paracetamol", unit: "viên" },
        { _id: new mongoose.Types.ObjectId(), name: "Amoxicillin", unit: "viên" },
      ];

      Product.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProducts),
        }),
      });

      // WE USE MOCK IMPLEMENTATION TO RETURN DATA BASED ON INPUT
      TransactionDetail.aggregate = jest.fn().mockImplementation(async (pipeline) => {
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
            return isPeriodQuery ? [{ totalQuantity: 50 }] : [{ totalQuantity: 100 }];
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
        { _id: new mongoose.Types.ObjectId(), name: "Active Product", unit: "viên" },
        { _id: new mongoose.Types.ObjectId(), name: "Inactive Product", unit: "viên" },
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
      const mockProduct = { _id: new mongoose.Types.ObjectId(), name: "Test", unit: "viên" };

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
