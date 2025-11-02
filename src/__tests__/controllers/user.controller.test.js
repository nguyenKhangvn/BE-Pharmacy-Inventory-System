import { jest } from '@jest/globals';

// Mock User model
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();

jest.unstable_mockModule('../../models/user.model.js', () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments
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
