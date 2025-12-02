import { Router } from "express";
import auth from "../middleware/auth.js";
import ProductController from "../controllers/product.controller.js";
import {
  validate,
  getProductsQuerySchema,
  productIdParamSchema,
} from "../validators/productValidator.js";

const router = Router();

// GET /api/products?search=&categoryId=&supplierId=&page=&limit=&isActive=&pagination=
router.get(
  "/",
  auth,
  validate(getProductsQuerySchema, "query"),
  ProductController.getProducts
);

// GET /api/products/:id
router.get(
  "/:id",
  auth,
  validate(productIdParamSchema, "params"),
  ProductController.getProductById
);

export default router;
