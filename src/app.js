import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import cronJobs from "./jobs/cronJobs.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");

    // Khởi tạo cron jobs sau khi kết nối DB thành công
    cronJobs.initialize();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

// Connect to database
connectDB();

// Routes
app.get("/", (req, res) => {
  res.json({ message: "Medicine BE API is running!" });
});

// Import routes
app.use("/api", routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// 404 handler - must be last
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;
