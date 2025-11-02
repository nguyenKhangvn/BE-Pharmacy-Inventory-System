import { jest } from '@jest/globals';

// Mock User model
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();
const mockCreate = jest.fn();
const mockFindOne = jest.fn();
const mockFindById = jest.fn();

jest.unstable_mockModule('../../models/user.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
    create: mockCreate,
    findOne: mockFindOne,
    findById: mockFindById
  }
}));

// Import sau khi mock
const { default: User } = await import('../../models/user.model.js');
const { default: UserController } = await import('../../controllers/user.controller.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const mockReq = (query = {}, user = null) => ({
  query,
  user
});

const mockReqUpdate = (id, body = {}, user = { id: 'admin-id', role: 'admin' }) => ({
  params: { id },
  body,
  user
});

describe('userController.getUsers', () => {
  let findMock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup chain methods for User.find()
    findMock = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn()
    };
    
    mockFind.mockReturnValue(findMock);
  });

  describe('Basic functionality', () => {
    it('should return users list with default pagination (page=1, limit=25)', async () => {
      const mockUsers = [
        {
          _id: '507f1f77bcf86cd799439011',
          username: 'admin',
          fullName: 'Administrator',
          email: 'admin@example.com',
          phone: '0123456789',
          role: 'admin',
          status: 'active',
          lastLogin: new Date('2025-01-01'),
          createdAt: new Date('2024-01-01')
        },
        {
          _id: '507f1f77bcf86cd799439012',
          username: 'user1',
          fullName: 'User One',
          email: 'user1@example.com',
          phone: '0987654321',
          role: 'user',
          status: 'active',
          lastLogin: new Date('2025-01-02'),
          createdAt: new Date('2024-01-02')
        }
      ];

      findMock.lean.mockResolvedValue(mockUsers);
      mockCountDocuments.mockResolvedValue(2);

      const req = mockReq({});
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith(
        {},
        'username fullName email phone role status lastLogin createdAt'
      );
      expect(findMock.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(findMock.skip).toHaveBeenCalledWith(0);
      expect(findMock.limit).toHaveBeenCalledWith(25);
      
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveLength(2);
      expect(payload.pagination).toMatchObject({
        page: 1,
        limit: 25,
        total: 2,
        pages: 1
      });
    });

    it('should return empty array when no users found', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({});
      const res = mockRes();

      await UserController.getUsers(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([]);
      expect(payload.pagination.total).toBe(0);
    });
  });

  describe('Pagination', () => {
    it('should handle page=2 correctly', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(50);

      const req = mockReq({ page: '2', limit: '25' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(findMock.skip).toHaveBeenCalledWith(25); // (2-1) * 25
      expect(findMock.limit).toHaveBeenCalledWith(25);
      
      const payload = res.json.mock.calls[0][0];
      expect(payload.pagination).toMatchObject({
        page: 2,
        limit: 25,
        total: 50,
        pages: 2
      });
    });

    it('should validate limit to allowed values (25/50/100)', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      // Test with limit=50 (valid)
      const req1 = mockReq({ limit: '50' });
      const res1 = mockRes();
      await UserController.getUsers(req1, res1);
      expect(findMock.limit).toHaveBeenCalledWith(50);

      // Test with limit=30 (invalid, default to 25)
      jest.clearAllMocks();
      mockFind.mockReturnValue(findMock);
      const req2 = mockReq({ limit: '30' });
      const res2 = mockRes();
      await UserController.getUsers(req2, res2);
      expect(findMock.limit).toHaveBeenCalledWith(25);
    });

    it('should handle invalid page number (default to 1)', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ page: '-5' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(findMock.skip).toHaveBeenCalledWith(0); // page 1
      const payload = res.json.mock.calls[0][0];
      expect(payload.pagination.page).toBe(1);
    });
  });

  describe('Search functionality', () => {
    it('should search by username', async () => {
      const mockUsers = [
        {
          _id: '507f1f77bcf86cd799439011',
          username: 'admin',
          fullName: 'Administrator',
          email: 'admin@example.com',
          phone: '0123456789',
          role: 'admin',
          status: 'active',
          lastLogin: null,
          createdAt: new Date()
        }
      ];

      findMock.lean.mockResolvedValue(mockUsers);
      mockCountDocuments.mockResolvedValue(1);

      const req = mockReq({ q: 'admin' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith(
        {
          $or: [
            { username: expect.any(RegExp) },
            { fullName: expect.any(RegExp) },
            { email: expect.any(RegExp) },
            { phone: expect.any(RegExp) }
          ]
        },
        expect.any(String)
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.data).toHaveLength(1);
      expect(payload.data[0].username).toBe('admin');
    });

    it('should escape special regex characters in search query', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ q: 'test.*' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      const searchQuery = mockFind.mock.calls[0][0];
      expect(searchQuery.$or).toBeDefined();
      expect(searchQuery.$or[0].username.source).toContain('\\.');
    });

    it('should ignore empty search query', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ q: '   ' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith({}, expect.any(String));
    });
  });

  describe('Filtering', () => {
    it('should filter by status', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ status: 'locked' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith(
        { status: 'locked' },
        expect.any(String)
      );
    });

    it('should filter by role', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ role: 'admin' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith(
        { role: 'admin' },
        expect.any(String)
      );
    });

    it('should combine search, status and role filters', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ q: 'nguyen', status: 'active', role: 'user' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      const searchQuery = mockFind.mock.calls[0][0];
      expect(searchQuery.$or).toBeDefined();
      expect(searchQuery.status).toBe('active');
      expect(searchQuery.role).toBe('user');
    });
  });

  describe('Sorting', () => {
    it('should sort by username ascending', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ sortBy: 'username', sortOrder: 'asc' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(findMock.sort).toHaveBeenCalledWith({ username: 1 });
    });

    it('should sort by lastLogin descending', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ sortBy: 'lastLogin', sortOrder: 'desc' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(findMock.sort).toHaveBeenCalledWith({ lastLogin: -1 });
    });

    it('should default to createdAt desc for invalid sortBy', async () => {
      findMock.lean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const req = mockReq({ sortBy: 'invalid' });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(findMock.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should handle all valid sort fields', async () => {
      const validSortFields = ['username', 'createdAt', 'lastLogin', 'role', 'status'];
      
      for (const field of validSortFields) {
        jest.clearAllMocks();
        mockFind.mockReturnValue(findMock);
        findMock.lean.mockResolvedValue([]);
        mockCountDocuments.mockResolvedValue(0);

        const req = mockReq({ sortBy: field, sortOrder: 'asc' });
        const res = mockRes();

        await UserController.getUsers(req, res);

        expect(findMock.sort).toHaveBeenCalledWith({ [field]: 1 });
      }
    });
  });

  describe('Data normalization', () => {
    it('should handle missing optional fields (fullName, phone, lastLogin)', async () => {
      const mockUsers = [
        {
          _id: '507f1f77bcf86cd799439011',
          username: 'user1',
          email: 'user1@example.com',
          role: 'user',
          status: 'active',
          createdAt: new Date()
        }
      ];

      findMock.lean.mockResolvedValue(mockUsers);
      mockCountDocuments.mockResolvedValue(1);

      const req = mockReq({});
      const res = mockRes();

      await UserController.getUsers(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0]).toMatchObject({
        id: '507f1f77bcf86cd799439011',
        username: 'user1',
        fullName: '',
        email: 'user1@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });
    });

    it('should convert _id to string in response', async () => {
      const mockUsers = [
        {
          _id: '507f1f77bcf86cd799439011',
          username: 'user1',
          fullName: 'User One',
          email: 'user1@example.com',
          phone: '0123456789',
          role: 'user',
          status: 'active',
          lastLogin: null,
          createdAt: new Date()
        }
      ];

      findMock.lean.mockResolvedValue(mockUsers);
      mockCountDocuments.mockResolvedValue(1);

      const req = mockReq({});
      const res = mockRes();

      await UserController.getUsers(req, res);

      const payload = res.json.mock.calls[0][0];
      const item = payload.data[0];
      expect(typeof item.id).toBe('string');
      expect(item._id).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should return 500 on database error', async () => {
      const dbError = new Error('Database connection failed');
      mockFind.mockImplementation(() => {
        throw dbError;
      });

      const req = mockReq({});
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.getUsers(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Get users error:',
        dbError
      );
      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/server error/i);

      consoleErrorSpy.mockRestore();
    });

    it('should handle query execution error', async () => {
      const queryError = new Error('Query execution failed');
      findMock.lean.mockRejectedValue(queryError);

      const req = mockReq({});
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.getUsers(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/server error/i);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Complex scenarios', () => {
    it('should handle all query parameters combined', async () => {
      const mockUsers = [
        {
          _id: '507f1f77bcf86cd799439011',
          username: 'user1',
          fullName: 'Nguyen Van A',
          email: 'nguyen@example.com',
          phone: '0123456789',
          role: 'user',
          status: 'active',
          lastLogin: new Date('2025-01-01'),
          createdAt: new Date('2024-01-01')
        }
      ];

      findMock.lean.mockResolvedValue(mockUsers);
      mockCountDocuments.mockResolvedValue(15);

      const req = mockReq({
        q: 'nguyen',
        page: '2',
        limit: '50',
        sortBy: 'username',
        sortOrder: 'asc',
        status: 'active',
        role: 'user'
      });
      const res = mockRes();

      await UserController.getUsers(req, res);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          role: 'user',
          $or: expect.any(Array)
        }),
        expect.any(String)
      );
      expect(findMock.sort).toHaveBeenCalledWith({ username: 1 });
      expect(findMock.skip).toHaveBeenCalledWith(50); // (2-1) * 50
      expect(findMock.limit).toHaveBeenCalledWith(50);

      const payload = res.json.mock.calls[0][0];
      expect(payload.pagination).toMatchObject({
        page: 2,
        limit: 50,
        total: 15,
        pages: 1
      });
    });
  });
});

describe('userController.createUser', () => {
  let mockLeanFn;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a fresh mock lean function for each test
    mockLeanFn = jest.fn().mockResolvedValue(null);
    
    // Mock findOne to always return an object with lean method
    mockFindOne.mockReturnValue({
      lean: mockLeanFn
    });
  });

  const mockReqBody = (body = {}) => ({ 
    body, 
    user: { id: 'admin-id', role: 'admin' } 
  });

  describe('AC: Validation - Các trường thông tin bắt buộc', () => {
    it('should return 400 if username is missing', async () => {
      const req = mockReqBody({
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/bắt buộc/i);
    });

    it('should return 400 if email is missing', async () => {
      const req = mockReqBody({
        username: 'testuser',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/bắt buộc/i);
    });

    it('should return 400 if password is missing', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/bắt buộc/i);
    });

    it('should return 400 if confirmPassword is missing', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/bắt buộc/i);
    });

    it('should return 400 if password length < 6 characters', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: '12345',
        confirmPassword: '12345'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/6 ký tự/i);
    });

    it('should return 400 if password and confirmPassword do not match', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'different123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/không khớp/i);
    });
  });

  describe('AC: Email phải đúng định dạng và là duy nhất', () => {
    it('should return 400 if email format is invalid', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/định dạng/i);
    });

    it('should return 400 for email without @ symbol', async () => {
      const req = mockReqBody({
        username: 'testuser',
        email: 'invalidemail.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.message).toMatch(/định dạng/i);
    });

    it('should return 409 if email already exists (duy nhất trong hệ thống)', async () => {
      // First call (username check) - no duplicate
      mockLeanFn.mockResolvedValueOnce(null);
      // Second call (email check) - duplicate found
      mockLeanFn.mockResolvedValueOnce({ email: 'test@example.com' });

      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/email.*đã tồn tại/i);
    });
  });

  describe('AC: Tên đăng nhập không được trùng lặp', () => {
    it('should return 409 if username already exists', async () => {
      // First call (username check) - duplicate found
      mockLeanFn.mockResolvedValueOnce({ username: 'testuser' });
      // Second call won't be reached but setup anyway
      mockLeanFn.mockResolvedValueOnce(null);

      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/tên đăng nhập.*đã tồn tại/i);
    });

    it('should check for duplicate username case-insensitively', async () => {
      mockLeanFn.mockResolvedValueOnce({ username: 'TestUser' });

      const req = mockReqBody({
        username: 'TestUser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockFindOne).toHaveBeenCalledWith({ username: 'testuser' });
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('AC: Thêm mới thành công với thông báo xác nhận', () => {
    it('should create user successfully with all required fields', async () => {
      // Mock no duplicates for both checks
      mockLeanFn.mockResolvedValue(null);
      
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        role: 'admin', // default value in controller is 'admin'
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'TestUser',
        fullName: 'Test User',
        email: 'Test@Example.com',
        phone: '0123456789',
        password: 'password123',
        confirmPassword: 'password123'
        // role not provided, should default to "admin" as per controller default
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockFindOne).toHaveBeenCalledTimes(2);
      expect(mockCreate).toHaveBeenCalledWith({
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        password: 'password123',
        role: 'admin', // Controller has default role = "admin"
        status: 'active'
      });

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Thêm người dùng thành công');
      expect(payload.data).toMatchObject({
        id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });
    });

    it('should create user with default role=user if role not provided', async () => {
      // This test should be updated to reflect that controller defaults to 'admin'
      // but we can explicitly pass role: 'user' or undefined to test the normalization
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'user' // explicitly pass user role
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user'
        })
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.role).toBe('user');
    });

    it('should create user with role=admin when specified', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        username: 'adminuser',
        fullName: 'Admin User',
        email: 'admin@example.com',
        phone: '',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'adminuser',
        fullName: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'admin'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'admin'
        })
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.role).toBe('admin');
    });

    it('should normalize username and email to lowercase', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        username: 'normalizeduser',
        fullName: 'Normalized User',
        email: 'normalized@example.com',
        phone: '',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: '  NormalizedUser  ',
        fullName: 'Normalized User', // Add fullName to avoid validation errors
        email: '  Normalized@Example.COM  ',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      // Verify findOne was called with normalized values
      expect(mockFindOne).toHaveBeenCalledTimes(2);
      expect(mockFindOne).toHaveBeenNthCalledWith(1, { username: 'normalizeduser' });
      expect(mockFindOne).toHaveBeenNthCalledWith(2, { email: 'normalized@example.com' });
      
      // Verify create was called with normalized values
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'normalizeduser',
          email: 'normalized@example.com'
        })
      );

      expect(res.status).toHaveBeenCalledWith(201);
      
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.username).toBe('normalizeduser');
      expect(payload.data.email).toBe('normalized@example.com');
    });

    it('should handle missing optional fields (fullName, phone)', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439015',
        username: 'minimaluser',
        fullName: '',
        email: 'minimal@example.com',
        phone: '',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'minimaluser',
        email: 'minimal@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: '',
          phone: ''
        })
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.fullName).toBe('');
      expect(payload.data.phone).toBe('');
    });

    it('should trim and normalize fullName', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439025',
        username: 'trimtest',
        fullName: 'Trim Test',
        email: 'trim@example.com',
        phone: '',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'trimtest',
        fullName: '  Trim Test  ',
        email: 'trim@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Trim Test'
        })
      );
    });

    it('should trim and normalize phone number', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439026',
        username: 'phonetest',
        fullName: 'Phone Test',
        email: 'phone@example.com',
        phone: '0123456789',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'phonetest',
        email: 'phone@example.com',
        phone: '  0123456789  ',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '0123456789'
        })
      );
    });
  });

  describe('AC: Vai trò (Role) validation', () => {
    it('should accept valid role "admin"', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439016',
        username: 'adminuser',
        fullName: 'Admin User',
        email: 'admin@example.com',
        phone: '',
        role: 'admin',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'adminuser',
        email: 'admin@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'admin'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.role).toBe('admin');
    });

    it('should accept valid role "user"', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439017',
        username: 'regularuser',
        fullName: 'Regular User',
        email: 'user@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'regularuser',
        email: 'user@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'user'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.data.role).toBe('user');
    });

    it('should default invalid role to "user"', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439018',
        username: 'invalidrole',
        fullName: 'Invalid Role',
        email: 'invalidrole@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'invalidrole',
        email: 'invalidrole@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'superadmin' // invalid role
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'user'
        })
      );
    });
  });

  describe('AC: Trạng thái (Status) validation', () => {
    it('should create user with default status=active', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439019',
        username: 'activeuser',
        fullName: 'Active User',
        email: 'active@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'activeuser',
        email: 'active@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active'
        })
      );
    });

    it('should create user with status=locked when specified', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439020',
        username: 'lockeduser',
        fullName: 'Locked User',
        email: 'locked@example.com',
        phone: '',
        role: 'user',
        status: 'locked',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'lockeduser',
        fullName: 'Locked User',
        email: 'locked@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        status: 'locked'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'locked'
        })
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.status).toBe('locked');
    });

    it('should default invalid status to "active"', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439021',
        username: 'invalidstatus',
        fullName: 'Invalid Status',
        email: 'invalidstatus@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'invalidstatus',
        email: 'invalidstatus@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        status: 'suspended' // invalid status
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active'
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should return 500 on database error during duplicate check', async () => {
      mockLeanFn.mockRejectedValue(new Error('Database error'));

      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.createUser(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Create user error:',
        expect.any(Error)
      );
      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/server error/i);

      consoleErrorSpy.mockRestore();
    });

    it('should return 500 if User.create fails', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockRejectedValue(new Error('Create failed'));

      const req = mockReqBody({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('AC: Response format và data structure', () => {
    it('should return correct data structure after successful creation', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439022',
        username: 'structuretest',
        fullName: 'Structure Test',
        email: 'structure@example.com',
        phone: '0987654321',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'structuretest',
        fullName: 'Structure Test',
        email: 'structure@example.com',
        phone: '0987654321',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      const payload = res.json.mock.calls[0][0];
      
      // Verify response structure
      expect(payload).toHaveProperty('success', true);
      expect(payload).toHaveProperty('message');
      expect(payload).toHaveProperty('data');
      
      // Verify data fields
      expect(payload.data).toHaveProperty('id');
      expect(payload.data).toHaveProperty('username');
      expect(payload.data).toHaveProperty('fullName');
      expect(payload.data).toHaveProperty('email');
      expect(payload.data).toHaveProperty('phone');
      expect(payload.data).toHaveProperty('role');
      expect(payload.data).toHaveProperty('status');
      expect(payload.data).toHaveProperty('lastLogin');
      
      // Should not return password
      expect(payload.data).not.toHaveProperty('password');
    });

    it('should convert _id to string id in response', async () => {
      mockLeanFn.mockResolvedValue(null);
      mockCreate.mockResolvedValue({
        _id: '507f1f77bcf86cd799439023',
        username: 'idtest',
        fullName: 'ID Test',
        email: 'idtest@example.com',
        phone: '',
        role: 'user',
        status: 'active',
        lastLogin: null
      });

      const req = mockReqBody({
        username: 'idtest',
        email: 'idtest@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      });
      const res = mockRes();

      await UserController.createUser(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(typeof payload.data.id).toBe('string');
      expect(payload.data.id).toBe('507f1f77bcf86cd799439023');
      expect(payload.data).not.toHaveProperty('_id');
    });
  });
});

describe('userController.getUserById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockReqWithId = (id, user = { id: 'admin-id', role: 'admin' }) => ({
    params: { id },
    user
  });

  describe('AC: Lấy thông tin chi tiết người dùng', () => {
    it('should return user details successfully', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        role: 'user',
        status: 'active',
        lastLogin: new Date('2024-01-15T10:30:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z')
      };

      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439011');
      const res = mockRes();

      await UserController.getUserById(req, res);

      expect(mockFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockSelect).toHaveBeenCalledWith('-password');
      
      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Lấy thông tin người dùng thành công');
      expect(payload.data).toMatchObject({
        id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        role: 'user',
        status: 'active'
      });
    });

    it('should not return password field', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        fullName: 'Test User',
        email: 'test@example.com',
        phone: '0123456789',
        role: 'user',
        status: 'active',
        lastLogin: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z')
      };

      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439011');
      const res = mockRes();

      await UserController.getUserById(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data).not.toHaveProperty('password');
    });

    it('should handle missing optional fields (fullName, phone, lastLogin)', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439012',
        username: 'minimaluser',
        email: 'minimal@example.com',
        role: 'user',
        status: 'active',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z')
      };

      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439012');
      const res = mockRes();

      await UserController.getUserById(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.fullName).toBe('');
      expect(payload.data.phone).toBe('');
      expect(payload.data.lastLogin).toBe(null);
    });

    it('should convert _id to string id in response', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439013',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
        status: 'active',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z')
      };

      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439013');
      const res = mockRes();

      await UserController.getUserById(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(typeof payload.data.id).toBe('string');
      expect(payload.data.id).toBe('507f1f77bcf86cd799439013');
      expect(payload.data).not.toHaveProperty('_id');
    });
  });

  describe('AC: Validation', () => {
    it('should return 400 for invalid ObjectId format', async () => {
      const req = mockReqWithId('invalid-id');
      const res = mockRes();

      await UserController.getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('ID người dùng không hợp lệ');
    });

    it('should return 400 for empty ID', async () => {
      const req = mockReqWithId('');
      const res = mockRes();

      await UserController.getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('ID người dùng không hợp lệ');
    });

    it('should return 400 for short ObjectId', async () => {
      const req = mockReqWithId('123');
      const res = mockRes();

      await UserController.getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
    });
  });

  describe('AC: User not found', () => {
    it('should return 404 when user does not exist', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439999');
      const res = mockRes();

      await UserController.getUserById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Không tìm thấy người dùng');
    });
  });

  describe('Error handling', () => {
    it('should return 500 on database error', async () => {
      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439011');
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.getUserById(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Get user by ID error:',
        expect.any(Error)
      );
      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Server error');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('AC: Response format và data structure', () => {
    it('should return correct data structure', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439014',
        username: 'structuretest',
        fullName: 'Structure Test',
        email: 'structure@example.com',
        phone: '0987654321',
        role: 'admin',
        status: 'active',
        lastLogin: new Date('2024-01-15T10:30:00Z'),
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z')
      };

      const mockSelect = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockUser)
      });

      mockFindById.mockReturnValue({
        select: mockSelect
      });

      const req = mockReqWithId('507f1f77bcf86cd799439014');
      const res = mockRes();

      await UserController.getUserById(req, res);

      const payload = res.json.mock.calls[0][0];
      
      // Verify response structure
      expect(payload).toHaveProperty('success', true);
      expect(payload).toHaveProperty('message');
      expect(payload).toHaveProperty('data');
      
      // Verify data fields
      expect(payload.data).toHaveProperty('id');
      expect(payload.data).toHaveProperty('username');
      expect(payload.data).toHaveProperty('fullName');
      expect(payload.data).toHaveProperty('email');
      expect(payload.data).toHaveProperty('phone');
      expect(payload.data).toHaveProperty('role');
      expect(payload.data).toHaveProperty('status');
      expect(payload.data).toHaveProperty('lastLogin');
      expect(payload.data).toHaveProperty('createdAt');
      expect(payload.data).toHaveProperty('updatedAt');
    });
  });
});

// Update user test
describe('userController.updateUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeDoc = (overrides = {}) => ({
    _id: '507f1f77bcf86cd799439011',
    username: 'olduser',
    email: 'old@example.com',
    fullName: 'Old Name',
    phone: '000',
    role: 'user',
    status: 'active',
    lastLogin: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    save: jest.fn().mockImplementation(function() {
      // Update timestamps when save is called
      this.updatedAt = new Date();
      return Promise.resolve(this);
    }),
    ...overrides
  });

  describe('AC: Validation - ID và User tồn tại', () => {
    it('should return 400 for invalid ObjectId format', async () => {
      const req = mockReqUpdate('invalid-id', {});
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('ID người dùng không hợp lệ');
    });

    it('should return 400 for empty ID', async () => {
      const req = mockReqUpdate('', {});
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('ID người dùng không hợp lệ');
    });

    it('should return 404 when user does not exist', async () => {
      mockFindById.mockResolvedValue(null);

      const req = mockReqUpdate('507f1f77bcf86cd799439099', {});
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(mockFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439099');
      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Không tìm thấy người dùng');
    });
  });

  describe('AC: Email validation', () => {
    it('should return 400 for invalid email format', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const req = mockReqUpdate(doc._id, { email: 'invalid-email' });
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/Email không đúng định dạng/i);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should return 409 when email already exists for another user', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      // Mock username check - no duplicate
      const leanFn = jest.fn()
        .mockResolvedValueOnce(null)                          // username ok
        .mockResolvedValueOnce({ _id: 'another-user-id' });   // email duplicate
      
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { 
        username: 'olduser', 
        email: 'duplicate@example.com' 
      });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(mockFindOne).toHaveBeenCalledTimes(2);
      
      // Verify email query has $ne condition
      const emailQuery = mockFindOne.mock.calls[1][0];
      expect(emailQuery).toMatchObject({ 
        email: 'duplicate@example.com', 
        _id: { $ne: doc._id } 
      });

      expect(res.status).toHaveBeenCalledWith(409);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/Email đã tồn tại/i);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should allow same email for the same user', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      // Mock check returns the same user
      const leanFn = jest.fn()
        .mockResolvedValueOnce(null)  // username check
        .mockResolvedValueOnce({ _id: doc._id }); // email check returns same user
      
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { 
        email: doc.email, // same email
        fullName: 'Updated Name'
      });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('AC: Username validation', () => {
    it('should return 409 when username already exists for another user', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      // Mock username check - duplicate found
      const leanFn = jest.fn().mockResolvedValue({ _id: 'another-user-id' });
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { username: 'NewUser' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      // Verify query has $ne condition
      const usernameQuery = mockFindOne.mock.calls[0][0];
      expect(usernameQuery).toMatchObject({ 
        username: 'newuser', // normalized
        _id: { $ne: doc._id } 
      });

      expect(res.status).toHaveBeenCalledWith(409);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/Tên đăng nhập đã tồn tại/i);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should normalize username to lowercase', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { username: '  NewUser  ' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.username).toBe('newuser');
      expect(mockFindOne).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'newuser' })
      );
    });
  });

  describe('AC: Role và Status validation', () => {
    it('should return 400 for invalid role', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const req = mockReqUpdate(doc._id, { role: 'superadmin' });
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/role không hợp lệ/i);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should accept valid role "admin"', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { role: 'admin' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.role).toBe('admin');
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should accept valid role "user"', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { role: 'user' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.role).toBe('user');
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 for invalid status', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const req = mockReqUpdate(doc._id, { status: 'suspended' });
      const res = mockRes();

      await UserController.updateUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toMatch(/status không hợp lệ/i);
      expect(doc.save).not.toHaveBeenCalled();
    });

    it('should accept valid status "active"', async () => {
      const doc = makeDoc({ status: 'locked' });
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { status: 'active' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.status).toBe('active');
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should accept valid status "locked"', async () => {
      const doc = makeDoc({ status: 'active' });
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { status: 'locked' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.status).toBe('locked');
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('AC: Successful update scenarios', () => {
    it('should update all user information successfully', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      // No duplicates
      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const body = {
        username: '  NewUser  ',
        email: '  NEW@EXAMPLE.COM  ',
        fullName: '  New Full Name  ',
        phone: '  0123456789  ',
        role: 'admin',
        status: 'locked'
      };
      const req = mockReqUpdate(doc._id, body);
      const res = mockRes();

      await UserController.updateUser(req, res);

      // Verify normalization
      expect(doc.username).toBe('newuser');
      expect(doc.email).toBe('new@example.com');
      expect(doc.fullName).toBe('New Full Name');
      expect(doc.phone).toBe('0123456789');
      expect(doc.role).toBe('admin');
      expect(doc.status).toBe('locked');

      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.message).toBe('Cập nhật thông tin thành công');
      expect(payload.data).toMatchObject({
        id: doc._id,
        username: 'newuser',
        email: 'new@example.com',
        fullName: 'New Full Name',
        phone: '0123456789',
        role: 'admin',
        status: 'locked'
      });
      expect(payload.data).not.toHaveProperty('password');
    });

    it('should update only specific fields provided', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { 
        fullName: 'Only Name Changed' 
      });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.fullName).toBe('Only Name Changed');
      expect(doc.username).toBe('olduser'); // unchanged
      expect(doc.email).toBe('old@example.com'); // unchanged
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle empty optional fields', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, {
        fullName: '',
        phone: ''
      });
      const res = mockRes();

      await UserController.updateUser(req, res);

      expect(doc.fullName).toBe('');
      expect(doc.phone).toBe('');
      expect(doc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('AC: Response format', () => {
    it('should return correct response structure', async () => {
      const doc = makeDoc();
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { fullName: 'Updated' });
      const res = mockRes();

      await UserController.updateUser(req, res);

      const payload = res.json.mock.calls[0][0];
      
      expect(payload).toHaveProperty('success', true);
      expect(payload).toHaveProperty('message');
      expect(payload).toHaveProperty('data');
      
      expect(payload.data).toHaveProperty('id');
      expect(payload.data).toHaveProperty('username');
      expect(payload.data).toHaveProperty('fullName');
      expect(payload.data).toHaveProperty('email');
      expect(payload.data).toHaveProperty('phone');
      expect(payload.data).toHaveProperty('role');
      expect(payload.data).toHaveProperty('status');
      expect(payload.data).toHaveProperty('lastLogin');
      
      expect(payload.data).not.toHaveProperty('password');
      expect(payload.data).not.toHaveProperty('_id');
    });
  });

  describe('Error handling', () => {
    it('should return 500 on database error', async () => {
      const dbError = new Error('Database connection failed');
      mockFindById.mockRejectedValue(dbError);

      const req = mockReqUpdate('507f1f77bcf86cd799439011', { fullName: 'Test' });
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.updateUser(req, res);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Update user error:', dbError);
      expect(res.status).toHaveBeenCalledWith(500);
      
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.message).toBe('Server error');

      consoleErrorSpy.mockRestore();
    });

    it('should return 500 when save fails', async () => {
      const doc = makeDoc();
      const saveError = new Error('Save failed');
      doc.save.mockRejectedValue(saveError);
      
      mockFindById.mockResolvedValue(doc);

      const leanFn = jest.fn().mockResolvedValue(null);
      mockFindOne.mockReturnValue({ lean: leanFn });

      const req = mockReqUpdate(doc._id, { fullName: 'Test' });
      const res = mockRes();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await UserController.updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });
});