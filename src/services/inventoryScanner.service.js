import { Product, InventoryLot, Alert } from "../models/index.js";

/**
 * Service quét kho hàng đêm để phát hiện:
 * - Sản phẩm có tồn kho thấp hơn mức tối thiểu
 * - Sản phẩm hết hàng
 * - Lô hàng sắp hết hạn (trong vòng 30 ngày)
 * - Lô hàng đã hết hạn
 */
class InventoryScanner {
  /**
   * Chạy quét toàn bộ kho
   */
  async scanInventory() {
    console.log(
      `[InventoryScanner] Starting inventory scan at ${new Date().toISOString()}`
    );

    try {
      const results = {
        lowStock: 0,
        outOfStock: 0,
        expiringSoon: 0,
        expired: 0,
        totalAlerts: 0,
        errors: [],
      };

      // 1. Quét tồn kho thấp và hết hàng
      await this.scanStockLevels(results);

      // 2. Quét hạn sử dụng
      await this.scanExpiryDates(results);

      console.log(
        `[InventoryScanner] Scan completed. Results:`,
        JSON.stringify(results, null, 2)
      );

      return results;
    } catch (error) {
      console.error("[InventoryScanner] Error during scan:", error);
      throw error;
    }
  }

  /**
   * Quét tồn kho so với mức tối thiểu
   */
  async scanStockLevels(results) {
    try {
      // Lấy tất cả sản phẩm active
      const products = await Product.find({ isActive: true }).lean();

      for (const product of products) {
        try {
          const currentStock = product.currentStock || 0;
          const minimumStock = product.minimumStock || 0;

          // Kiểm tra hết hàng
          if (currentStock === 0) {
            await this.createOrUpdateAlert({
              alertType: "OUT_OF_STOCK",
              severity: "CRITICAL",
              productId: product._id,
              productSku: product.sku,
              productName: product.name,
              currentStock,
              minimumStock,
              message: `Sản phẩm ${product.name} (SKU: ${product.sku}) đã hết hàng`,
            });
            results.outOfStock++;
          }
          // Kiểm tra tồn kho thấp
          else if (currentStock < minimumStock) {
            const severity = this.calculateStockSeverity(
              currentStock,
              minimumStock
            );
            await this.createOrUpdateAlert({
              alertType: "LOW_STOCK",
              severity,
              productId: product._id,
              productSku: product.sku,
              productName: product.name,
              currentStock,
              minimumStock,
              message: `Sản phẩm ${product.name} (SKU: ${product.sku}) có tồn kho thấp: ${currentStock}/${minimumStock} ${product.unit}`,
            });
            results.lowStock++;
          }
        } catch (error) {
          console.error(
            `[InventoryScanner] Error scanning product ${product.sku}:`,
            error
          );
          results.errors.push({
            product: product.sku,
            error: error.message,
          });
        }
      }
    } catch (error) {
      console.error("[InventoryScanner] Error in scanStockLevels:", error);
      throw error;
    }
  }

  /**
   * Quét hạn sử dụng của các lô hàng
   */
  async scanExpiryDates(results) {
    try {
      const now = new Date();
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(now.getDate() + 30);

      // Lấy tất cả lô hàng có số lượng > 0 và có ngày hết hạn
      const lots = await InventoryLot.find({
        quantity: { $gt: 0 },
        expiryDate: { $exists: true, $ne: null },
      })
        .populate("productId", "sku name unit")
        .populate("warehouseId", "name")
        .lean();

      for (const lot of lots) {
        try {
          if (!lot.productId) continue; // Skip nếu product đã bị xóa

          const expiryDate = new Date(lot.expiryDate);
          const daysUntilExpiry = Math.ceil(
            (expiryDate - now) / (1000 * 60 * 60 * 24)
          );

          // Đã hết hạn
          if (expiryDate < now) {
            await this.createOrUpdateAlert({
              alertType: "EXPIRED",
              severity: "CRITICAL",
              productId: lot.productId._id,
              productSku: lot.productId.sku,
              productName: lot.productId.name,
              warehouseId: lot.warehouseId?._id,
              inventoryLotId: lot._id,
              lotNumber: lot.lotNumber,
              expiryDate: lot.expiryDate,
              daysUntilExpiry,
              currentStock: lot.quantity,
              message: `Lô hàng ${lot.lotNumber} của sản phẩm ${lot.productId.name} đã hết hạn từ ${Math.abs(daysUntilExpiry)} ngày trước`,
            });
            results.expired++;
          }
          // Sắp hết hạn (trong vòng 30 ngày)
          else if (expiryDate <= thirtyDaysLater) {
            const severity = this.calculateExpirySeverity(daysUntilExpiry);
            await this.createOrUpdateAlert({
              alertType: "EXPIRING_SOON",
              severity,
              productId: lot.productId._id,
              productSku: lot.productId.sku,
              productName: lot.productId.name,
              warehouseId: lot.warehouseId?._id,
              inventoryLotId: lot._id,
              lotNumber: lot.lotNumber,
              expiryDate: lot.expiryDate,
              daysUntilExpiry,
              currentStock: lot.quantity,
              message: `Lô hàng ${lot.lotNumber} của sản phẩm ${lot.productId.name} sắp hết hạn trong ${daysUntilExpiry} ngày`,
            });
            results.expiringSoon++;
          }
        } catch (error) {
          console.error(
            `[InventoryScanner] Error scanning lot ${lot.lotNumber}:`,
            error
          );
          results.errors.push({
            lot: lot.lotNumber,
            error: error.message,
          });
        }
      }
    } catch (error) {
      console.error("[InventoryScanner] Error in scanExpiryDates:", error);
      throw error;
    }
  }

  /**
   * Tạo hoặc cập nhật alert
   * Nếu alert tương tự đã tồn tại và đang ACTIVE, không tạo duplicate
   */
  async createOrUpdateAlert(alertData) {
    try {
      // Kiểm tra xem có alert tương tự đang ACTIVE không
      const existingAlert = await Alert.findOne({
        alertType: alertData.alertType,
        productId: alertData.productId,
        inventoryLotId: alertData.inventoryLotId || null,
        status: "ACTIVE",
      });

      if (existingAlert) {
        // Cập nhật thông tin alert hiện tại
        Object.assign(existingAlert, {
          ...alertData,
          updatedAt: new Date(),
        });
        await existingAlert.save();
        return existingAlert;
      } else {
        // Tạo alert mới
        const newAlert = new Alert(alertData);
        await newAlert.save();
        return newAlert;
      }
    } catch (error) {
      console.error("[InventoryScanner] Error creating/updating alert:", error);
      throw error;
    }
  }

  /**
   * Tính toán mức độ nghiêm trọng dựa trên % tồn kho
   */
  calculateStockSeverity(currentStock, minimumStock) {
    const percentage = (currentStock / minimumStock) * 100;

    if (percentage <= 25) return "CRITICAL"; // <= 25% mức tối thiểu
    if (percentage <= 50) return "HIGH"; // <= 50% mức tối thiểu
    if (percentage <= 75) return "MEDIUM"; // <= 75% mức tối thiểu
    return "LOW";
  }

  /**
   * Tính toán mức độ nghiêm trọng dựa trên số ngày đến hạn
   */
  calculateExpirySeverity(daysUntilExpiry) {
    if (daysUntilExpiry <= 0) return "CRITICAL"; // Đã hết hạn
    if (daysUntilExpiry <= 7) return "HIGH"; // <= 7 ngày
    if (daysUntilExpiry <= 15) return "MEDIUM"; // <= 15 ngày
    return "LOW"; // <= 30 ngày
  }

  /**
   * Tự động giải quyết các alert đã không còn vấn đề
   */
  async autoResolveAlerts() {
    try {
      console.log("[InventoryScanner] Auto-resolving outdated alerts...");

      // Resolve các LOW_STOCK/OUT_OF_STOCK alerts nếu tồn kho đã được bổ sung
      const stockAlerts = await Alert.find({
        alertType: { $in: ["LOW_STOCK", "OUT_OF_STOCK"] },
        status: "ACTIVE",
      });

      for (const alert of stockAlerts) {
        const product = await Product.findById(alert.productId);
        if (product) {
          const shouldResolve =
            alert.alertType === "OUT_OF_STOCK"
              ? product.currentStock > 0
              : product.currentStock >= product.minimumStock;

          if (shouldResolve) {
            alert.status = "RESOLVED";
            alert.resolvedAt = new Date();
            alert.notes = "Auto-resolved: Tồn kho đã được bổ sung";
            await alert.save();
          }
        }
      }

      // Resolve các EXPIRING_SOON alerts nếu lô hàng đã hết
      const expiryAlerts = await Alert.find({
        alertType: "EXPIRING_SOON",
        status: "ACTIVE",
      });

      for (const alert of expiryAlerts) {
        if (alert.inventoryLotId) {
          const lot = await InventoryLot.findById(alert.inventoryLotId);
          if (!lot || lot.quantity === 0) {
            alert.status = "RESOLVED";
            alert.resolvedAt = new Date();
            alert.notes = "Auto-resolved: Lô hàng đã hết";
            await alert.save();
          }
        }
      }

      console.log("[InventoryScanner] Auto-resolve completed");
    } catch (error) {
      console.error("[InventoryScanner] Error in autoResolveAlerts:", error);
    }
  }
}

export default new InventoryScanner();
