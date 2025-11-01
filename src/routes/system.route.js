import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// @route   GET /api/health
// @desc    Health check endpoint
// @access  Public
router.get("/health", (req, res) => {
  const healthData = {
    status: "OK",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    database: {
      status:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      name: mongoose.connection.name,
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
    },
  };

  // Check if database is connected
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      ...healthData,
      status: "ERROR",
      message: "Database connection failed",
    });
  }

  res.json(healthData);
});

// @route   GET /api/info
// @desc    API information
// @access  Public
router.get("/info", (req, res) => {
  res.json({
    name: "Medicine Management API",
    version: "1.0.0",
    description: "RESTful API for pharmacy and medicine management system",
    author: "Medicine Team",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      organizations: "/api/organizations",
      products: "/api/products",
      health: "/api/health",
    },
    documentation: "/docs/API.md",
  });
});

export default router;
