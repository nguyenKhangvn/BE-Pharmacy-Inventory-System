import mongoose from "mongoose";
import {
  Transaction,
  TransactionDetail,
  InventoryLot,
} from "../models/index.js"; // <--- ĐÃ THÊM InventoryLot

/**
 * Helper: Tìm danh sách TransactionID có chứa Lot Number khớp từ khóa
 * Logic: Tìm trong InventoryLot trước -> Lấy ID -> Tìm trong TransactionDetail
 */
async function findTransactionIdsByLotNumber(searchString) {
  if (!searchString) return [];

  // 1. Tìm các lô trong bảng InventoryLot khớp với từ khóa
  const lots = await InventoryLot.find({
    lotNumber: { $regex: searchString, $options: "i" },
  }).select("_id");

  const lotIds = lots.map((l) => l._id);
  if (lotIds.length === 0) return [];

  // 2. Tìm các chi tiết giao dịch có chứa các inventoryLotId này
  const details = await TransactionDetail.find({
    inventoryLotId: { $in: lotIds },
  })
    .select("transactionId")
    .lean();

  // 3. Trả về danh sách transactionId
  return details.map((d) => d.transactionId);
}

export async function getInboundTransactionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid id");
    err.statusCode = 400;
    throw err;
  }

  const tx = await Transaction.findOne({ _id: id, type: "INBOUND" })
    .populate({ path: "destinationWarehouseId", select: "code name address" })
    .populate({ path: "supplierId", select: "code name status" })
    .populate({ path: "userId", select: "username fullName" })
    .lean();

  if (!tx) {
    const err = new Error("Transaction not found");
    err.statusCode = 404;
    throw err;
  }

  const details = await TransactionDetail.find({ transactionId: id })
    .populate({ path: "productId", select: "sku name unit" })
    .populate({
      path: "inventoryLotId",
      select: "lotNumber expiryDate quantity unitCost",
    })
    .lean();

  return { header: tx, details };
}

/**
 * Get list of INBOUND transactions with filters and pagination
 */
export async function getInboundTransactions(filters = {}) {
  const {
    search = "",
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    lotNumber,
  } = filters;

  const query = { type: "INBOUND" };
  const searchConditions = [];

  // --- 1. XỬ LÝ TÌM KIẾM CHUNG (SEARCH BAR) ---
  if (search && search.trim()) {
    const searchTrim = search.trim();

    // A. Tìm theo ID Transaction
    if (mongoose.isValidObjectId(searchTrim)) {
      searchConditions.push({ _id: searchTrim });
    }

    // B. Tìm theo Mã phiếu (Reference Code)
    searchConditions.push({
      referenceCode: { $regex: searchTrim, $options: "i" },
    });

    // C. Tìm theo Số Lô (Sử dụng Helper đã fix)
    const txIdsByLot = await findTransactionIdsByLotNumber(searchTrim);
    if (txIdsByLot.length > 0) {
      searchConditions.push({ _id: { $in: txIdsByLot } });
    }

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    }
  }

  // --- 2. XỬ LÝ LỌC CỤ THỂ THEO LOT (DROPDOWN/PARAM) ---
  if (lotNumber && lotNumber.trim()) {
    // Tái sử dụng helper để tìm ID giao dịch chứa lô này
    const txIds = await findTransactionIdsByLotNumber(lotNumber.trim());

    if (txIds.length > 0) {
      // Dùng $and để giao với các điều kiện tìm kiếm ở trên (nếu có)
      if (!query.$and) query.$and = [];
      query.$and.push({ _id: { $in: txIds } });
    } else {
      // Tìm không thấy lô nào -> Trả về danh sách rỗng
      return {
        transactions: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
  }

  // --- 3. FILTER DATE ---
  if (fromDate || toDate) {
    query.transactionDate = {};
    if (fromDate) {
      query.transactionDate.$gte = new Date(fromDate);
    }
    if (toDate) {
      query.transactionDate.$lte = new Date(toDate);
    }
  }

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate({ path: "destinationWarehouseId", select: "code name address" })
      .populate({ path: "supplierId", select: "code name status" })
      .populate({ path: "userId", select: "username fullName" })
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  // --- 4. GẮN LOT NUMBERS VÀO KẾT QUẢ ---
  const txIds = transactions.map((tx) => tx._id);

  // Lấy chi tiết để hiển thị số lô ra ngoài bảng
  const details = await TransactionDetail.find({
    transactionId: { $in: txIds },
  })
    .populate({ path: "inventoryLotId", select: "lotNumber" }) // Populate lấy số lô
    .select("transactionId inventoryLotId")
    .lean();

  const lotMap = {};
  details.forEach((d) => {
    const txId = String(d.transactionId);
    if (!lotMap[txId]) lotMap[txId] = [];

    // Lấy lotNumber từ object đã populate
    const lotNum = d.inventoryLotId?.lotNumber;

    if (lotNum && !lotMap[txId].includes(lotNum)) {
      lotMap[txId].push(lotNum);
    }
  });

  const transactionsWithLots = transactions.map((tx) => ({
    ...tx,
    lotNumbers: lotMap[String(tx._id)] || [],
  }));

  return {
    transactions: transactionsWithLots,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get list of OUTBOUND transactions with filters and pagination
 */
export async function getOutboundTransactions(filters = {}) {
  const {
    search = "",
    fromDate,
    toDate,
    page = 1,
    limit = 10,
    lotNumber,
  } = filters;

  const query = { type: "OUTBOUND" };
  const searchConditions = [];

  // --- 1. XỬ LÝ TÌM KIẾM CHUNG ---
  if (search && search.trim()) {
    const searchTrim = search.trim();
    if (mongoose.isValidObjectId(searchTrim)) {
      searchConditions.push({ _id: searchTrim });
    }
    searchConditions.push({
      referenceCode: { $regex: searchTrim, $options: "i" },
    });

    // Tìm theo Số Lô (Helper đã fix)
    const txIdsByLot = await findTransactionIdsByLotNumber(searchTrim);
    if (txIdsByLot.length > 0) {
      searchConditions.push({ _id: { $in: txIdsByLot } });
    }

    if (searchConditions.length > 0) {
      query.$or = searchConditions;
    }
  }

  // --- 2. XỬ LÝ LỌC CỤ THỂ THEO LOT ---
  if (lotNumber && lotNumber.trim()) {
    const txIds = await findTransactionIdsByLotNumber(lotNumber.trim());
    if (txIds.length > 0) {
      if (!query.$and) query.$and = [];
      query.$and.push({ _id: { $in: txIds } });
    } else {
      return {
        transactions: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }
  }

  // --- 3. FILTER DATE ---
  if (fromDate || toDate) {
    query.transactionDate = {};
    if (fromDate) {
      query.transactionDate.$gte = new Date(fromDate);
    }
    if (toDate) {
      query.transactionDate.$lte = new Date(toDate);
    }
  }

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate({ path: "sourceWarehouseId", select: "code name address" })
      .populate({ path: "departmentId", select: "code name" })
      .populate({ path: "userId", select: "username fullName" })
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(query),
  ]);

  // --- 4. GẮN LOT NUMBERS VÀO KẾT QUẢ ---
  const txIds = transactions.map((tx) => tx._id);
  const details = await TransactionDetail.find({
    transactionId: { $in: txIds },
  })
    .populate({ path: "inventoryLotId", select: "lotNumber" })
    .select("transactionId inventoryLotId")
    .lean();

  const lotMap = {};
  details.forEach((d) => {
    const txId = String(d.transactionId);
    if (!lotMap[txId]) lotMap[txId] = [];
    const lotNum = d.inventoryLotId?.lotNumber;
    if (lotNum && !lotMap[txId].includes(lotNum)) {
      lotMap[txId].push(lotNum);
    }
  });

  const transactionsWithLots = transactions.map((tx) => ({
    ...tx,
    lotNumbers: lotMap[String(tx._id)] || [],
  }));

  return {
    transactions: transactionsWithLots,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get OUTBOUND transaction by ID with details
 */
export async function getOutboundTransactionById(id) {
  if (!mongoose.isValidObjectId(id)) {
    const err = new Error("Invalid id");
    err.statusCode = 400;
    throw err;
  }

  const tx = await Transaction.findOne({ _id: id, type: "OUTBOUND" })
    .populate({ path: "sourceWarehouseId", select: "code name address" })
    .populate({ path: "departmentId", select: "code name" })
    .populate({ path: "userId", select: "username fullName" })
    .lean();

  if (!tx) {
    const err = new Error("Transaction not found");
    err.statusCode = 404;
    throw err;
  }

  const details = await TransactionDetail.find({ transactionId: id })
    .populate({ path: "productId", select: "sku name unit" })
    .populate({
      path: "inventoryLotId",
      select: "lotNumber expiryDate quantity unitCost",
    })
    .lean();

  return { header: tx, details };
}
