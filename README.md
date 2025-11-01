# Medicine Backend API

Dự án Backend API cho hệ thống quản lý thuốc.

## Cấu trúc thư mục

```
medicine-be/
├── src/
│   ├── config/          # Cấu hình database, môi trường
│   ├── controllers/     # Xử lý logic nghiệp vụ
│   ├── middleware/      # Middleware (auth, validation, etc.)
│   ├── models/          # Models MongoDB/Mongoose
│   ├── routes/          # Định nghĩa API routes
│   ├── services/        # Business logic services
│   ├── utils/           # Utilities và helper functions
│   ├── validators/      # Validation schemas
│   ├── app.js          # Express app setup
│   └── server.js       # Server entry point
├── logs/               # Log files
├── uploads/            # File uploads
├── tests/              # Test files
├── docs/               # API documentation
├── .env.example        # Environment variables template
└── package.json
```

## Cài đặt

1. Clone repository
2. Cài đặt dependencies:

   ```bash
   npm install
   ```

3. Tạo file `.env` từ `.env.example`:

   ```bash
   cp .env.example .env
   ```

4. Cấu hình các biến môi trường trong file `.env`

5. Chạy ứng dụng:
   ```bash
   npm run dev    # Development mode
   npm start      # Production mode
   ```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Đăng ký tài khoản
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/me` - Lấy thông tin user hiện tại

## Technologies

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variables
- **validator** - Data validation

## Scripts

```bash
npm start          # Chạy production
npm run dev        # Chạy development với nodemon
npm run lint       # Chạy ESLint
npm run format     # Format code với Prettier
```
