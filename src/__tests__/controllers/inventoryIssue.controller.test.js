import { jest } from '@jest/globals';

// Mock mongoose session
const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};

const mockStartSession = jest.fn(() => mockSession);

jest.unstable_mockModule('mongoose', () => ({
  default: {
    startSession: mockStartSession,
    Schema: class Schema {},
    model: jest.fn(),
  },
}));

// Mock models
const mockInventoryIssueCreate = jest.fn();
const mockInventoryIssueSave = jest.fn();
const mockInventoryIssueCountDocuments = jest.fn();
const mockInventoryIssueValidateStockAvailability = jest.fn();
const mockInventoryIssueErrorMessages = {
  WAREHOUSE_REQUIRED: "Kho xuất là bắt buộc",
  DEPARTMENT_REQUIRED: "Khoa/Phòng nhận là bắt buộc",
  ISSUE_DATE_REQUIRED: "Ngày xuất là bắt buộc",
  ITEMS_REQUIRED: "Danh sách sản phẩm không được để trống",
  ITEMS_MUST_BE_ARRAY: "Danh sách sản phẩm phải là một mảng",
  PRODUCT_ID_REQUIRED: "Mã sản phẩm là bắt buộc",
  QUANTITY_REQUIRED: "Số lượng là bắt buộc",
  QUANTITY_INVALID: "Số lượng phải lớn hơn 0",
  UNIT_PRICE_REQUIRED: "Đơn giá là bắt buộc",
  UNIT_PRICE_INVALID: "Đơn giá phải lớn hơn hoặc bằng 0",
  INSUFFICIENT_STOCK: "Không đủ hàng tồn kho",
  LOT_NOT_FOUND: "Không tìm thấy lô hàng phù hợp",
  PRODUCT_NOT_FOUND: "Sản phẩm không tồn tại",
};

jest.unstable_mockModule('../../models/inventoryIssue.model.js', () => ({
  default: class InventoryIssue {
    constructor(data) {
      Object.assign(this, data);
      this._id = 'issue-id-123';
      this.createdAt = new Date();
    }
    async save(options) {
      mockInventoryIssueSave(this, options);
      return this;
    }
    static create = mockInventoryIssueCreate;
    static validateStockAvailability = mockInventoryIssueValidateStockAvailability;
    static countDocuments(query) {
      return mockInventoryIssueCountDocuments(query);
    }
    static ErrorMessages = mockInventoryIssueErrorMessages;
  },
}));

const mockInventoryLotFindById = jest.fn();
const mockInventoryLotFefoSuggestLots = jest.fn();
const mockInventoryLotAggregateStock = jest.fn();
const mockInventoryLotFindOne = jest.fn();

jest.unstable_mockModule('../../models/inventoryLot.model.js', () => ({
  default: {
    findById: (id) => ({
      session: jest.fn((session) => mockInventoryLotFindById(id, session)),
    }),
    fefoSuggestLots: mockInventoryLotFefoSuggestLots,
    aggregateStock: mockInventoryLotAggregateStock,
    findOne: mockInventoryLotFindOne,
  },
}));

const mockProductFindById = jest.fn();
const mockProductFind = jest.fn();

jest.unstable_mockModule('../../models/product.model.js', () => ({
  default: {
    findById: mockProductFindById,
    find: mockProductFind,
  },
}));

const mockDepartmentFindOne = jest.fn();
const mockDepartmentSave = jest.fn();

jest.unstable_mockModule('../../models/department.model.js', () => ({
  default: class Department {
    constructor(data) {
      Object.assign(this, data);
      this._id = 'department-id-123';
    }
    async save(options) {
      mockDepartmentSave(this, options);
      return this;
    }
    static findOne(query) {
      return {
        session: jest.fn(() => mockDepartmentFindOne(query)),
      };
    }
  },
}));

const mockTransactionSave = jest.fn();

jest.unstable_mockModule('../../models/transaction.model.js', () => ({
  default: class Transaction {
    constructor(data) {
      Object.assign(this, data);
      this._id = 'transaction-id-123';
    }
    async save(options) {
      mockTransactionSave(this, options);
      return this;
    }
  },
}));

const mockTransactionDetailInsertMany = jest.fn();

jest.unstable_mockModule('../../models/transactionDetail.model.js', () => ({
  default: class TransactionDetail {
    constructor(data) {
      Object.assign(this, data);
      this._id = 'txdetail-id-123';
    }
    static insertMany = mockTransactionDetailInsertMany;
  },
}));

// Mock ApiResponse utility
jest.unstable_mockModule('../../utils/ApiResponse.js', () => ({
  default: {
    success: (res, data, message, statusCode = 200) => {
      return res.status(statusCode).json({ success: true, message, data });
    },
    error: (res, message, statusCode, errors = null) => {
      return res.status(statusCode).json({ success: false, message, errors });
    },
  },
}));

// Import after mocking
const { default: InventoryIssueController } = await import('../../controllers/inventoryIssue.controller.js');

// Helper functions
const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const mockReq = (body = {}, user = { id: 'user-id-123' }, query = {}) => ({
  body,
  user,
  query,
});

describe('InventoryIssueController.createInventoryIssue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDepartmentFindOne.mockResolvedValue({
      _id: 'department-id-123',
      name: 'Khoa Nội',
      code: 'DEPT-KHOA-NOI',
    });
    mockTransactionSave.mockResolvedValue();
    mockTransactionDetailInsertMany.mockResolvedValue([]);
  });

  afterEach(() => {
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockClear();
    mockSession.abortTransaction.mockClear();
    mockSession.endSession.mockClear();
  });

  describe('Validation Tests', () => {
    it('should return 400 if warehouseId is missing', async () => {
      const req = mockReq({
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.WAREHOUSE_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if department is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        issueDate: '2025-11-05',
        items: [],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.DEPARTMENT_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if department is only whitespace', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: '   ',
        issueDate: '2025-11-05',
        items: [],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.DEPARTMENT_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if issueDate is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        items: [],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.ISSUE_DATE_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if items is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.ITEMS_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if items is not an array', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: 'not-an-array',
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.ITEMS_MUST_BE_ARRAY,
        errors: null,
      });
    });

    it('should return 400 if items array is empty', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.ITEMS_REQUIRED,
        errors: null,
      });
    });

    it('should return 400 if item.productId is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.PRODUCT_ID_REQUIRED} (dòng 1)`,
        errors: null,
      });
    });

    it('should return 400 if item.quantity is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', unitPrice: 5000 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.QUANTITY_REQUIRED} (dòng 1)`,
        errors: null,
      });
    });

    it('should return 400 if item.quantity is zero', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 0, unitPrice: 5000 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      // Note: 0 is falsy, so it triggers QUANTITY_REQUIRED not QUANTITY_INVALID
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.QUANTITY_REQUIRED} (dòng 1)`,
        errors: null,
      });
    });

    it('should return 400 if item.quantity is negative', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: -10, unitPrice: 5000 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if item.unitPrice is missing', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.UNIT_PRICE_REQUIRED} (dòng 1)`,
        errors: null,
      });
    });

    it('should return 400 if item.unitPrice is negative', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10, unitPrice: -5000 }],
      });
      const res = mockRes();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.UNIT_PRICE_INVALID} (dòng 1)`,
        errors: null,
      });
    });

    it('should support totalQuantity field instead of quantity', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        details: [{ productId: 'product-id-123', totalQuantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
          productCode: 'PROD001',
        }),
      });
      mockInventoryLotFefoSuggestLots.mockResolvedValue([
        { inventoryLotId: 'lot-id-123', pickQty: 10 },
      ]);
      mockInventoryLotFindById.mockResolvedValue({
        _id: 'lot-id-123',
        lotNumber: 'LOT001',
        expiryDate: new Date('2026-01-01'),
        unitCost: 4500,
        quantity: 100,
        save: jest.fn(),
      });
      
      mockInventoryIssueCountDocuments.mockReturnValue({
        session: jest.fn().mockResolvedValue(0),
      });
      mockInventoryIssueSave.mockResolvedValue();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockInventoryIssueValidateStockAvailability).toHaveBeenCalled();
      expect(mockDepartmentFindOne).toHaveBeenCalled();
      expect(mockTransactionSave).toHaveBeenCalled();
      expect(mockTransactionDetailInsertMany).toHaveBeenCalled();
    });
  });

  describe('Stock Validation Tests', () => {
    it('should return 400 if stock is insufficient', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 1000, unitPrice: 5000 }],
      });
      const res = mockRes();

      const stockErrors = [
        {
          productId: 'product-id-123',
          productName: 'Paracetamol 500mg',
          requested: 1000,
          available: 500,
          shortage: 500,
          message: 'Sản phẩm "Paracetamol 500mg" không đủ tồn kho. Yêu cầu: 1000, Có sẵn: 500, Thiếu: 500',
        },
      ];
      mockInventoryIssueValidateStockAvailability.mockResolvedValue(stockErrors);

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: mockInventoryIssueErrorMessages.INSUFFICIENT_STOCK,
        errors: stockErrors,
      });
    });
  });

  describe('Success Tests - Auto FEFO Allocation', () => {
    it('should create inventory issue successfully with auto FEFO allocation', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05T10:00:00.000Z',
        notes: 'Test note',
        items: [
          { productId: 'product-id-123', quantity: 100, unitPrice: 5000 },
        ],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Paracetamol 500mg',
          productCode: 'PROD001',
          unit: 'Viên',
        }),
      });
      mockInventoryLotFefoSuggestLots.mockResolvedValue([
        { inventoryLotId: 'lot-id-001', pickQty: 60 },
        { inventoryLotId: 'lot-id-002', pickQty: 40 },
      ]);
      
      const mockLot1 = {
        _id: 'lot-id-001',
        lotNumber: 'LOT001',
        expiryDate: new Date('2026-01-01'),
        unitCost: 4500,
        quantity: 60,
        save: jest.fn(),
      };
      const mockLot2 = {
        _id: 'lot-id-002',
        lotNumber: 'LOT002',
        expiryDate: new Date('2026-03-01'),
        unitCost: 4500,
        quantity: 40,
        save: jest.fn(),
      };

      mockInventoryLotFindById
        .mockResolvedValueOnce(mockLot1)
        .mockResolvedValueOnce(mockLot2);

      mockInventoryIssueCountDocuments.mockReturnValue({
        session: jest.fn().mockResolvedValue(0),
      });
      mockInventoryIssueSave.mockResolvedValue();

      const mockCreatedIssue = {
        _id: 'issue-id-123',
        issueCode: 'IX000001',
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: new Date('2025-11-05T10:00:00.000Z'),
        notes: 'Test note',
        details: [
          {
            productId: 'product-id-123',
            totalQuantity: 100,
            unitPrice: 5000,
            lineTotal: 500000,
            lotAllocations: [
              {
                inventoryLotId: 'lot-id-001',
                lotNumber: 'LOT001',
                expiryDate: new Date('2026-01-01'),
                quantity: 60,
                unitCost: 4500,
              },
              {
                inventoryLotId: 'lot-id-002',
                lotNumber: 'LOT002',
                expiryDate: new Date('2026-03-01'),
                quantity: 40,
                unitCost: 4500,
              },
            ],
          },
        ],
        totalAmount: 500000,
        status: 'confirmed',
        createdBy: 'user-id-123',
        confirmedBy: 'user-id-123',
        confirmedAt: new Date(),
        createdAt: new Date(),
      };

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Tạo phiếu xuất kho thành công',
          data: expect.objectContaining({
            issueCode: expect.stringMatching(/^PX-\d{8}-\d{3}$/),
            department: 'Khoa Nội',
            totalAmount: 500000,
            status: 'confirmed',
          }),
        })
      );

      expect(mockLot1.save).toHaveBeenCalled();
      expect(mockLot2.save).toHaveBeenCalled();
      expect(mockDepartmentFindOne).toHaveBeenCalled();
      expect(mockTransactionSave).toHaveBeenCalled();
      expect(mockTransactionDetailInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            transactionId: 'transaction-id-123',
            productId: 'product-id-123',
            inventoryLotId: 'lot-id-001',
            quantity: 60,
            unitPrice: 5000,
          }),
          expect.objectContaining({
            transactionId: 'transaction-id-123',
            productId: 'product-id-123',
            inventoryLotId: 'lot-id-002',
            quantity: 40,
            unitPrice: 5000,
          }),
        ]),
        expect.objectContaining({ session: mockSession })
      );
    });

    it('should return 404 if product not found', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'invalid-product-id', quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: `${mockInventoryIssueErrorMessages.PRODUCT_NOT_FOUND}: invalid-product-id`,
        errors: null,
      });
    });

    it('should return 400 if no lots found for product', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
          productCode: 'PROD001',
        }),
      });
      mockInventoryLotFefoSuggestLots.mockResolvedValue([]);

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Success Tests - Manual Lot Selection', () => {
    it('should create inventory issue with manual lot selection', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05T10:00:00.000Z',
        notes: 'Manual lot selection',
        details: [
          {
            productId: 'product-id-123',
            totalQuantity: 100,
            unitPrice: 5000,
            lotAllocations: [
              {
                inventoryLotId: 'lot-id-001',
                lotNumber: 'LOT001',
                quantity: 100,
              },
            ],
          },
        ],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Paracetamol 500mg',
          productCode: 'PROD001',
        }),
      });

      const mockLot = {
        _id: 'lot-id-001',
        lotNumber: 'LOT001',
        expiryDate: new Date('2026-01-01'),
        unitCost: 4500,
        quantity: 200,
        save: jest.fn(),
      };

      mockInventoryLotFindById.mockResolvedValue(mockLot);

      mockInventoryIssueCountDocuments.mockReturnValue({
        session: jest.fn().mockResolvedValue(0),
      });
      mockInventoryIssueSave.mockResolvedValue();

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockLot.save).toHaveBeenCalled();
      expect(mockLot.quantity).toBe(100); // 200 - 100
      expect(mockDepartmentFindOne).toHaveBeenCalled();
      expect(mockTransactionSave).toHaveBeenCalled();
      expect(mockTransactionDetailInsertMany).toHaveBeenCalled();
    });

    it('should return 404 if provided lot not found', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        details: [
          {
            productId: 'product-id-123',
            totalQuantity: 100,
            unitPrice: 5000,
            lotAllocations: [
              { inventoryLotId: 'invalid-lot-id', quantity: 100 },
            ],
          },
        ],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
          productCode: 'PROD001',
        }),
      });
      mockInventoryLotFindById.mockResolvedValue(null);

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Không tìm thấy lô hàng: invalid-lot-id',
        errors: null,
      });
    });

    it('should return 400 if lot quantity insufficient', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        details: [
          {
            productId: 'product-id-123',
            totalQuantity: 100,
            unitPrice: 5000,
            lotAllocations: [
              { inventoryLotId: 'lot-id-001', quantity: 100 },
            ],
          },
        ],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
          productCode: 'PROD001',
        }),
      });

      const mockLot = {
        _id: 'lot-id-001',
        lotNumber: 'LOT001',
        quantity: 50,
      };

      mockInventoryLotFindById.mockResolvedValue(mockLot);

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Lô "LOT001" không đủ số lượng. Có sẵn: 50, Yêu cầu: 100',
        errors: null,
      });
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle ValidationError', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
        }),
      });
      mockInventoryLotFefoSuggestLots.mockResolvedValue([
        { inventoryLotId: 'lot-id-123', pickQty: 10 },
      ]);
      mockInventoryLotFindById.mockResolvedValue({
        _id: 'lot-id-123',
        lotNumber: 'LOT001',
        expiryDate: new Date('2026-01-01'),
        unitCost: 4500,
        quantity: 10,
        save: jest.fn(),
      });

      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.errors = {
        field1: { message: 'Error 1' },
        field2: { message: 'Error 2' },
      };
      
      mockInventoryIssueCountDocuments.mockReturnValue({
        session: jest.fn().mockResolvedValue(0),
      });
      mockInventoryIssueSave.mockImplementation(() => {
        throw validationError;
      });

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Lỗi xác thực dữ liệu',
        errors: ['Error 1', 'Error 2'],
      });
    });

    it('should handle CastError', async () => {
      const req = mockReq({
        warehouseId: 'invalid-id',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockResolvedValue([]);
      mockProductFindById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'product-id-123',
          name: 'Test Product',
        }),
      });

      const castError = new Error('Cast failed');
      castError.name = 'CastError';
      castError.path = 'warehouseId';
      castError.value = 'invalid-id';
      mockInventoryLotFefoSuggestLots.mockRejectedValue(castError);

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'ID không hợp lệ: warehouseId = invalid-id',
        errors: null,
      });
    });

    it('should handle generic server error', async () => {
      const req = mockReq({
        warehouseId: 'warehouse-id-123',
        department: 'Khoa Nội',
        issueDate: '2025-11-05',
        items: [{ productId: 'product-id-123', quantity: 10, unitPrice: 5000 }],
      });
      const res = mockRes();

      mockInventoryIssueValidateStockAvailability.mockRejectedValue(
        new Error('Database connection failed')
      );

      await InventoryIssueController.createInventoryIssue(req, res);

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Lỗi server khi tạo phiếu xuất kho. Vui lòng thử lại sau.',
        errors: null,
      });
    });
  });
});

describe('InventoryIssueController.getProductSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if warehouseId is missing', async () => {
    const req = mockReq({}, null, {});
    const res = mockRes();

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: mockInventoryIssueErrorMessages.WAREHOUSE_REQUIRED,
      errors: null,
    });
  });

  it('should return product suggestions successfully', async () => {
    const req = mockReq({}, null, {
      warehouseId: 'warehouse-id-123',
      q: 'para',
    });
    const res = mockRes();

    const mockProducts = [
      {
        _id: 'product-id-123',
        sku: 'PROD001',
        name: 'Paracetamol 500mg',
        unit: 'Viên',
      },
    ];

    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    });

    mockInventoryLotAggregateStock.mockResolvedValue([
      {
        stockQty: 1000,
        nearestExpiry: new Date('2026-01-01'),
        stockValue: 4500000,
      },
    ]);

    mockInventoryLotFindOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        unitCost: 4500,
        expiryDate: new Date('2026-01-01'),
        lotNumber: 'LOT001',
      }),
    });

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Lấy danh sách gợi ý sản phẩm thành công',
      data: [
        {
          id: 'product-id-123',
          sku: 'PROD001',
          name: 'Paracetamol 500mg',
          unit: 'Viên',
          availableQty: 1000,
          unitPrice: 4500,
          nearestExpiry: expect.any(Date),
          lotNumber: 'LOT001',
        },
      ],
    });
  });

  it('should return suggestions with zero stock if no lots available', async () => {
    const req = mockReq({}, null, {
      warehouseId: 'warehouse-id-123',
      q: 'test',
    });
    const res = mockRes();

    const mockProducts = [
      {
        _id: 'product-id-123',
        sku: 'PROD001',
        name: 'Test Product',
        unit: 'Box',
      },
    ];

    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockProducts),
    });

    mockInventoryLotAggregateStock.mockResolvedValue([]);

    mockInventoryLotFindOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Lấy danh sách gợi ý sản phẩm thành công',
      data: [
        {
          id: 'product-id-123',
          sku: 'PROD001',
          name: 'Test Product',
          unit: 'Box',
          availableQty: 0,
          unitPrice: 0,
          nearestExpiry: null,
          lotNumber: null,
        },
      ],
    });
  });

  it('should search without query parameter', async () => {
    const req = mockReq({}, null, {
      warehouseId: 'warehouse-id-123',
    });
    const res = mockRes();

    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(mockProductFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle CastError for invalid warehouseId', async () => {
    const req = mockReq({}, null, {
      warehouseId: 'invalid-id',
    });
    const res = mockRes();

    const castError = new Error('Cast failed');
    castError.name = 'CastError';
    castError.value = 'invalid-id';

    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(castError),
    });

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'ID kho không hợp lệ: invalid-id',
      errors: null,
    });
  });

  it('should handle generic server error', async () => {
    const req = mockReq({}, null, {
      warehouseId: 'warehouse-id-123',
    });
    const res = mockRes();

    mockProductFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('Database error')),
    });

    await InventoryIssueController.getProductSuggestions(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Lỗi server khi lấy gợi ý sản phẩm. Vui lòng thử lại sau.',
      errors: null,
    });
  });
});
