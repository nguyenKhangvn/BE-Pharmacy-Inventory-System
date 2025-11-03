import { jest } from '@jest/globals';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// Mock jsonwebtoken
const mockJwtSign = jest.fn(() => 'fake.jwt.token');
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: mockJwtSign
  },
  sign: mockJwtSign
}));

// Mock User model
const mockFindOne = jest.fn();
jest.unstable_mockModule('../../models/user.model.js', () => ({
  default: {
    findOne: mockFindOne
  }
}));

// Import sau khi mock
const { default: jwt } = await import('jsonwebtoken');
const { default: User } = await import('../../models/user.model.js');
const { default: AuthController } = await import('../../controllers/auth.controller.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const mockReq = (body = {}) => ({ body });

describe('authController.login (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('400 - Missing username or password', async () => {
    const req = mockReq({ username: 'admin' }); // thiếu password
    const res = mockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(typeof payload.message).toBe('string');
  });

  it('401 - User not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const req = mockReq({ username: 'admin', password: 'admin123' });
    const res = mockRes();

    await AuthController.login(req, res);

    expect(mockFindOne).toHaveBeenCalledWith({ username: 'admin' });
    expect(res.status).toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/Invalid username or password/i);
  });

  it('403 - Account is locked (status = locked)', async () => {
    mockFindOne.mockResolvedValue({
      status: 'locked'
    });

    const req = mockReq({ username: 'admin', password: 'admin123' });
    const res = mockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/locked/i);
  });

  it('401 - Invalid password', async () => {
    mockFindOne.mockResolvedValue({
      status: 'active',
      comparePassword: jest.fn().mockResolvedValue(false)
    });

    const req = mockReq({ username: 'admin', password: 'wrong' });
    const res = mockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/Invalid username or password/i);
  });

  it('200 - Login successful & return token', async () => {
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      username: 'admin',
      email: 'admin@pis.local',
      role: 'admin',
      status: 'active',
      comparePassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    mockFindOne.mockResolvedValue(mockUser);

    const req = mockReq({ username: 'admin', password: 'admin123' });
    const res = mockRes();

    await AuthController.login(req, res);

    // Đã cập nhật lastLogin và gọi save
    expect(mockUser.save).toHaveBeenCalledTimes(1);

    // Ký JWT đúng payload & options
    expect(mockJwtSign).toHaveBeenCalledWith(
      { userId: mockUser._id, username: 'admin', role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Phản hồi 200 với token và user
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toHaveProperty('token', 'fake.jwt.token');
    expect(payload.data).toHaveProperty('user.username', 'admin');
    expect(payload.data).toHaveProperty('user.email', 'admin@pis.local');
  });

  it('500 - Internal Server Error', async () => {
    mockFindOne.mockRejectedValue(new Error('DB down'));
    const req = mockReq({ username: 'admin', password: 'admin123' });
    const res = mockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/server error/i);
  });
});
