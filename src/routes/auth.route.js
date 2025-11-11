import express from "express";
import AuthController from "../controllers/auth.controller.js";

const router = express.Router();

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", AuthController.login);

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post("/register", AuthController.register);

export default router;