// test/controllers/supplier.controller.test.js
import { jest } from '@jest/globals';

// ---------- Mocks ----------
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();

// Mock Supplier model (ESM)
jest.unstable_mockModule('../../models/supplier.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments
  }
}));

// Mock ApiResponse: paginated() & error()
const paginatedSpy = jest.fn((res, data, pagination, message, code = 200) => {
  res.status(code);
  res.json({ success: true, message, data, pagination });
  return res;
});
const errorSpy = jest.fn((res, message = 'Server error', code = 500) => {
  res.status(code);
  res.json({ success: false, message });
  return res;
});
jest.unstable_mockModule('../../utils/ApiResponse.js', () => ({
  default: {
    paginated: paginatedSpy,
    error: errorSpy
  }
}));

// Import sau khi mock
const { default: Supplier } = await import('../../models/supplier.model.js');
const { default: ApiResponse } = await import('../../utils/ApiResponse.js');
const { default: SupplierController } = await import('../../controllers/supplier.controller.js');

// ---------- Helpers ----------
const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const mockReq = (query = {}) => ({ query });

// Dựng chuỗi phương thức find().sort().skip().limit().lean()
function makeFindChain(items, captured) {
  const chain = {
    sort: jest.fn(arg => { captured.sortArg = arg; return chain; }),
    skip: jest.fn(arg => { captured.skipArg = arg; return chain; }),
    limit: jest.fn(arg => { captured.limitArg = arg; return chain; }),
    lean: jest.fn(async () => items)
  };
  return chain;
}

const PROJECTION =
  'code name taxCode contactName phone email address ordersCount lastOrderAt status createdAt';

describe('SupplierController.getSuppliers', () => {
  let captured;
  let chain;

  beforeEach(() => {
    jest.clearAllMocks();
    captured = { sortArg: null, skipArg: null, limitArg: null };
    chain = makeFindChain([], captured);
    mockFind.mockReturnValue(chain);
  });

  // ---------- Basic ----------
  it('trả danh sách mặc định (page=1, limit=25) + sort createdAt desc', async () => {
    const items = [
      {
        _id: '507f1f77bcf86cd799439001',
        code: 'SUP0001',
        name: 'Pharma ABC',
        taxCode: '0312',
        contactName: 'Mr. A',
        phone: '090',
        email: 'a@abc.vn',
        address: '12 Nguyen Trai',
        ordersCount: 12,
        lastOrderAt: new Date('2025-10-01T00:00:00Z'),
        status: 'active',
        createdAt: new Date('2025-09-30T00:00:00Z')
      }
    ];
    chain.lean.mockResolvedValue(items);
    mockCountDocuments.mockResolvedValue(1);

    const req = mockReq({});
    const res = mockRes();

    await SupplierController.getSuppliers(req, res);

    expect(Supplier.find).toHaveBeenCalledWith({}, PROJECTION);
    expect(captured.sortArg).toEqual({ createdAt: -1 });
    expect(captured.skipArg).toBe(0);
    expect(captured.limitArg).toBe(25);

    expect(paginatedSpy).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Suppliers retrieved successfully');
    expect(payload.data).toHaveLength(1);
    expect(payload.pagination).toMatchObject({ page: 1, limit: 25, total: 1, pages: 1 });

    // DTO mapping
    expect(payload.data[0]).toMatchObject({
      id: '507f1f77bcf86cd799439001',
      code: 'SUP0001',
      name: 'Pharma ABC',
      address: '12 Nguyen Trai',
      taxCode: '0312',
      contactName: 'Mr. A',
      contact: { phone: '090', email: 'a@abc.vn' },
      orders: { count: 12, lastDate: new Date('2025-10-01T00:00:00Z') },
      status: 'active'
    });
  });

  it('trả mảng rỗng khi không có dữ liệu', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    const res = mockRes();
    await SupplierController.getSuppliers(mockReq({}), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual([]);
    expect(payload.pagination).toMatchObject({ total: 0, pages: 0 });
  });

  // ---------- Pagination ----------
  it('page=2, limit=25 → skip=25', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(50);

    const res = mockRes();
    await SupplierController.getSuppliers(mockReq({ page: '2', limit: '25' }), res);

    expect(captured.skipArg).toBe(25);
    expect(captured.limitArg).toBe(25);
    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination).toMatchObject({ page: 2, limit: 25, total: 50, pages: 2 });
  });

  it('limit hợp lệ 50; limit không hợp lệ (30) → fallback 25', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    // 50
    await SupplierController.getSuppliers(mockReq({ limit: '50' }), mockRes());
    expect(captured.limitArg).toBe(50);

    // reset
    jest.clearAllMocks(); captured = {}; chain = makeFindChain([], captured);
    mockFind.mockReturnValue(chain);
    mockCountDocuments.mockResolvedValue(0);

    // 30 → 25
    await SupplierController.getSuppliers(mockReq({ limit: '30' }), mockRes());
    expect(captured.limitArg).toBe(25);
  });

  it('page âm/invalid → mặc định 1', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    const res = mockRes();
    await SupplierController.getSuppliers(mockReq({ page: '-5' }), res);
    expect(captured.skipArg).toBe(0);
    expect(res.json.mock.calls[0][0].pagination.page).toBe(1);
  });

  // ---------- Search & Filter ----------
  it('tìm kiếm theo q → tạo $or name/taxCode/code với regex escape + i', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ q: 'pharma.*' }), mockRes());

    const query = mockFind.mock.calls[0][0];
    expect(query.$or).toHaveLength(3);
    for (const cond of query.$or) {
      const key = Object.keys(cond)[0];
      const rx = cond[key];
      expect(rx).toBeInstanceOf(RegExp);
      expect(rx.flags).toContain('i');
      // đã escape dấu chấm/asterisk
      expect(rx.source).toContain('pharma\\.\\*');
    }
  });

  it('filter theo status', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ status: 'active' }), mockRes());
    expect(mockFind).toHaveBeenCalledWith({ status: 'active' }, PROJECTION);
  });

  it('kết hợp q + status', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ q: 'abc', status: 'inactive' }), mockRes());
    const query = mockFind.mock.calls[0][0];
    expect(query.status).toBe('inactive');
    expect(Array.isArray(query.$or)).toBe(true);
  });

  // ---------- Sorting ----------
  it('sort by name asc', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ sortBy: 'name', sortOrder: 'asc' }), mockRes());
    expect(captured.sortArg).toEqual({ name: 1 });
  });

  it('sort by lastOrderAt desc', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ sortBy: 'lastOrderAt', sortOrder: 'desc' }), mockRes());
    expect(captured.sortArg).toEqual({ lastOrderAt: -1 });
  });

  it('sortBy không hợp lệ → mặc định createdAt desc', async () => {
    chain.lean.mockResolvedValue([]);
    mockCountDocuments.mockResolvedValue(0);

    await SupplierController.getSuppliers(mockReq({ sortBy: 'weird_field' }), mockRes());
    expect(captured.sortArg).toEqual({ createdAt: -1 });
  });

  // ---------- Mapping & Normalization ----------
  it('map DTO: điền giá trị mặc định cho trường optional', async () => {
    const items = [
      {
        _id: '507f1f77bcf86cd799439002',
        code: 'SUP0002',
        name: 'No Optional Co.',
        // thiếu address, taxCode, contactName, phone, email, ordersCount, lastOrderAt
        status: 'inactive',
        createdAt: new Date('2025-09-30T00:00:00Z')
      }
    ];
    chain.lean.mockResolvedValue(items);
    mockCountDocuments.mockResolvedValue(1);

    const res = mockRes();
    await SupplierController.getSuppliers(mockReq({}), res);

    const dto = res.json.mock.calls[0][0].data[0];
    expect(dto).toMatchObject({
      id: '507f1f77bcf86cd799439002',
      code: 'SUP0002',
      name: 'No Optional Co.',
      address: '',
      taxCode: '',
      contactName: '',
      contact: { phone: '', email: '' },
      orders: { count: 0, lastDate: null },
      status: 'inactive'
    });
    expect(typeof dto.id).toBe('string');
  });

  // ---------- Error handling ----------
  it('500 khi Supplier.find ném lỗi (sync)', async () => {
    mockFind.mockImplementation(() => { throw new Error('boom'); });

    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation();
    await SupplierController.getSuppliers(mockReq({}), res);

    expect(spy).toHaveBeenCalledWith('GET /api/suppliers error:', expect.any(Error));
    expect(errorSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toMatch(/Server error/i);
    spy.mockRestore();
  });

  it('500 khi .lean() reject (async)', async () => {
    chain.lean.mockRejectedValue(new Error('query fail'));
    mockCountDocuments.mockResolvedValue(0);

    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation();
    await SupplierController.getSuppliers(mockReq({}), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    spy.mockRestore();
  });

  // ---------- Complex ----------
  it('kịch bản đầy đủ: q + status + page/limit + sort', async () => {
    const items = [
      {
        _id: '507f1f77bcf86cd799439003',
        code: 'SUP0099',
        name: 'Z Pharma',
        taxCode: '099',
        contactName: 'Ms. Z',
        phone: '091',
        email: 'z@z.vn',
        address: '1 Main St',
        ordersCount: 3,
        lastOrderAt: new Date('2025-10-02T00:00:00Z'),
        status: 'active',
        createdAt: new Date('2025-09-25T00:00:00Z')
      }
    ];
    chain.lean.mockResolvedValue(items);
    mockCountDocuments.mockResolvedValue(27);

    const res = mockRes();
    await SupplierController.getSuppliers(
      mockReq({ q: 'pharma', status: 'active', page: '2', limit: '50', sortBy: 'name', sortOrder: 'asc' }),
      res
    );

    const query = mockFind.mock.calls[0][0];
    expect(query.status).toBe('active');
    expect(Array.isArray(query.$or)).toBe(true);
    expect(captured.limitArg).toBe(50);
    expect(captured.skipArg).toBe(50);
    expect(captured.sortArg).toEqual({ name: 1 });

    const payload = res.json.mock.calls[0][0];
    expect(payload.pagination).toMatchObject({ page: 2, limit: 50, total: 27, pages: 1 });
  });
});
// npm test -- __tests__/controllers/supplier.controller.test.js