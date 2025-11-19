import { jest } from "@jest/globals";
import { getTrends } from "../../controllers/report.controller.js";
import Transaction from "../../models/transaction.model.js";
import ApiResponse from "../../utils/ApiResponse.js";

// Mock models
jest.mock("../../models/transaction.model.js");

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
