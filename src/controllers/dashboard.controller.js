import Product from "../models/product.model.js";
import InventoryLot from "../models/inventoryLot.model.js";
import Transaction from "../models/transaction.model.js";
import { Alert } from "../models/index.js"; // Đảm bảo import Alert
import ApiResponse from "../utils/ApiResponse.js";

export const getDashboard = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ isActive: true });

    const stockValueResult = await InventoryLot.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ["$quantity", "$unitCost"] } },
        },
      },
    ]);
    const totalStockValue = stockValueResult[0]?.totalValue || 0;

    const expiringCount = await Alert.countDocuments({
      status: "ACTIVE",
      alertType: { $in: ["EXPIRING_SOON", "EXPIRED"] },
    });

    const lowStockCount = await Alert.countDocuments({
      status: "ACTIVE",
      alertType: { $in: ["LOW_STOCK", "OUT_OF_STOCK"] },
    });

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const chartData = [];
    const daysOfWeek = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = daysOfWeek[d.getDay()];
      chartData.push({
        date: dateStr,
        day: dayOfWeek,
        inbound: 0,
        outbound: 0,
      });
    }

    const transactionsLast7Days = await Transaction.aggregate([
      {
        $match: {
          transactionDate: { $gte: sevenDaysAgo, $lte: today },
          status: "COMPLETED",
        },
      },
      {
        $lookup: {
          from: "transactiondetails",
          localField: "_id",
          foreignField: "transactionId",
          as: "details",
        },
      },
      {
        $addFields: { calculatedTotalQty: { $sum: "$details.quantity" } },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$transactionDate",
                timezone: "+07:00",
              },
            },
            type: "$type",
          },
          totalQuantity: { $sum: "$calculatedTotalQty" },
        },
      },
    ]);

    transactionsLast7Days.forEach((item) => {
      const { date, type } = item._id;
      const dataPoint = chartData.find((d) => d.date === date);
      if (dataPoint) {
        if (type === "INBOUND") dataPoint.inbound = item.totalQuantity;
        else if (type === "OUTBOUND") dataPoint.outbound = item.totalQuantity;
      }
    });

    // 6. Lấy 5 cảnh báo mới nhất (Giữ nguyên)
    const recentAlerts = await Alert.find({ status: "ACTIVE" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("productId", "sku name unit")
      .populate("warehouseId", "name")
      .lean();

    const formattedAlerts = recentAlerts.map((alert) => ({
      id: alert._id,
      type: alert.alertType,
      severity: alert.severity,
      message: alert.message,
      product: alert.productId
        ? {
            id: alert.productId._id,
            sku: alert.productId.sku,
            name: alert.productId.name,
            unit: alert.productId.unit,
          }
        : null,
      warehouse: alert.warehouseId
        ? {
            id: alert.warehouseId._id,
            name: alert.warehouseId.name,
          }
        : null,
      createdAt: alert.createdAt,
    }));

    return ApiResponse.success(
      res,
      {
        kpis: {
          totalProducts,
          totalStockValue,
          expiringCount, // Giờ sẽ hiển thị số 5 đúng với thực tế
          lowStockCount,
        },
        chart: chartData,
        alerts: formattedAlerts,
      },
      "Lấy dữ liệu dashboard thành công"
    );
  } catch (error) {
    console.error("Get dashboard error:", error);
    return ApiResponse.error(res, "Lỗi server khi lấy dữ liệu dashboard.", 500);
  }
};
