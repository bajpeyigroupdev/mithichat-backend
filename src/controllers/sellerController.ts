import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { User } from '../models/user.model';
import { SellerTransaction } from '../models/sellerTransaction.model';
import { SellerLedger } from '../models/sellerLedger.model';
import { SellerStockRequest } from '../models/sellerStockRequest.model';
import { SellerPricingConfig } from '../models/sellerPricingConfig.model';
import { RechargeHistory } from '../models/RechargeHistory';
import { AuditLog } from '../models/auditLog.model';
import { Request as RequestModel, RequestStatus } from '../models/request.model';
import sendResponse from '../utils/reponse';

/**
 * Helper: Helper to fetch active pricing config with fallback defaults
 */
export async function getActiveSellerPricing() {
    let config = await SellerPricingConfig.findOne({ configKey: 'DEFAULT_SELLER_PRICING', isActive: true });
    if (!config) {
        config = await SellerPricingConfig.create({
            configKey: 'DEFAULT_SELLER_PRICING',
            userDiamondsPerRupee: 16.7,
            sellerDiscountFactor: 0.95,
            sellerCostPer1670Diamonds: 95,
            customerPricePer1670Diamonds: 100,
            minRechargeDiamonds: 10,
            isActive: true
        });
    }
    return config;
}

/**
 * Helper: Run DB operations in MongoDB Transaction session if supported, or atomic fallback
 */
async function runWithTransaction<T>(fn: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T> {
    let session: mongoose.ClientSession | null = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    } catch (error: any) {
        if (session && session.inTransaction()) {
            await session.abortTransaction();
        }
        // If MongoDB standalone without replica set, retry without session
        if (error.message && (error.message.includes('replica set') || error.message.includes('standalone'))) {
            return await fn(null);
        }
        throw error;
    } finally {
        if (session) {
            session.endSession();
        }
    }
}

/**
 * 1. Verify User for Seller Recharge Console
 * GET /api/seller/users/:userId
 */
export const verifyUserForSeller = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return sendResponse(res, 400, false, "User ID is required");
        }

        const targetUserId = parseInt(userId, 10);
        const query = isNaN(targetUserId)
            ? { userName: userId.trim(), isDeleted: false }
            : { $or: [{ userId: targetUserId }, { meethiId: userId.trim() }], isDeleted: false };

        const user = await User.findOne(query).select('userId name userName meethiId image diamonds coins status isBlocked role');

        if (!user) {
            return sendResponse(res, 444, false, "User account not found with this ID", undefined, undefined, "USER_NOT_FOUND");
        }

        if (user.isBlocked || user.status === 'Blocked') {
            return sendResponse(res, 403, false, "This user account is currently blocked", undefined, undefined, "USER_BLOCKED");
        }

        const isSellerRole = ['coinSeller', 'seller', 'agency'].includes(user.role as string);
        if (isSellerRole) {
            return sendResponse(res, 400, false, "Seller & Agency accounts cannot be recharged via User Recharge Console.", undefined, undefined, "CANNOT_RECHARGE_SELLER");
        }

        // Return safe user profile required by Seller UI
        return sendResponse(res, 200, true, "User verified successfully", {
            user: {
                userId: user.userId,
                name: user.name || 'User',
                userName: user.userName || `@user_${user.userId}`,
                meethiId: user.meethiId || `MC${user.userId}`,
                image: user.image || '',
                diamonds: user.diamonds || 0,
                coins: user.coins || 0,
                role: user.role,
                status: user.status || 'Active'
            }
        });
    } catch (error: any) {
        console.error("Error verifying user for seller:", error);
        return sendResponse(res, 500, false, error.message || "Failed to verify user");
    }
};

/**
 * 2. Seller -> User Recharge API (Atomic & Idempotent)
 * POST /api/seller/recharge
 */
export const rechargeUserBySeller = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized", undefined, undefined, "SELLER_UNAUTHORIZED");
        }

        // Role authorization check
        const allowedRoles = ['coinSeller', 'admin', 'superAdmin', 'owner'];
        if (!allowedRoles.includes(sellerAuth.role)) {
            return sendResponse(res, 403, false, "Access denied. Seller role required.", undefined, undefined, "SELLER_UNAUTHORIZED");
        }

        const { userId, diamonds, idempotencyKey } = req.body;

        // Validation
        if (!userId) {
            return sendResponse(res, 400, false, "Target User ID is required", undefined, undefined, "INVALID_RECHARGE");
        }

        const numDiamonds = Number(diamonds);
        if (isNaN(numDiamonds) || numDiamonds <= 0 || !Number.isInteger(numDiamonds)) {
            return sendResponse(res, 400, false, "Diamonds amount must be a positive whole integer", undefined, undefined, "INVALID_RECHARGE");
        }

        // Idempotency Check: Prevent duplicate recharge if idempotencyKey is reused
        if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim() !== '') {
            const existingTx = await SellerTransaction.findOne({ idempotencyKey: idempotencyKey.trim() });
            if (existingTx) {
                const receipt = {
                    txId: existingTx.transactionId,
                    userId: existingTx.userId,
                    diamonds: existingTx.diamonds,
                    customerAmount: existingTx.customerAmount,
                    sellerCost: existingTx.sellerCost,
                    profitAmount: existingTx.profitAmount,
                    status: existingTx.status,
                    date: existingTx.createdAt.toLocaleString(),
                    isDuplicate: true
                };
                return sendResponse(res, 200, true, "Transaction already processed (Idempotent response)", { receipt });
            }
        }

        // Check Seller Status
        const sellerDoc = await User.findById(sellerAuth.id);
        if (!sellerDoc || sellerDoc.isDeleted) {
            return sendResponse(res, 401, false, "Seller profile not found", undefined, undefined, "SELLER_UNAUTHORIZED");
        }

        if (sellerDoc.isBlocked || sellerDoc.status === 'Blocked') {
            return sendResponse(res, 403, false, "Your seller account is blocked. Cannot process recharge.", undefined, undefined, "SELLER_INACTIVE");
        }

        // Check Seller Stock Sufficiency (Server-side validation)
        if ((sellerDoc.diamonds || 0) < numDiamonds) {
            return sendResponse(res, 400, false, `Insufficient diamond stock balance. Required: 💎 ${numDiamonds.toLocaleString()}, Available: 💎 ${(sellerDoc.diamonds || 0).toLocaleString()}`, undefined, undefined, "INSUFFICIENT_STOCK");
        }

        // Verify target user
        const targetUserIdNum = Number(userId);
        const targetUser = await User.findOne({
            $or: [
                ...(isNaN(targetUserIdNum) ? [] : [{ userId: targetUserIdNum }]),
                { userName: String(userId).trim() },
                { meethiId: String(userId).trim() }
            ],
            isDeleted: false
        });

        if (!targetUser) {
            return sendResponse(res, 404, false, "Target user not found", undefined, undefined, "USER_NOT_FOUND");
        }

        if (targetUser.isBlocked || targetUser.status === 'Blocked') {
            return sendResponse(res, 403, false, "Target user account is blocked", undefined, undefined, "USER_BLOCKED");
        }

        const isTargetSellerRole = ['coinSeller', 'seller', 'agency'].includes(targetUser.role as string);
        if (isTargetSellerRole) {
            return sendResponse(res, 400, false, "Seller & Agency accounts cannot be recharged via User Recharge Console. Sellers must request stock from Admin.", undefined, undefined, "CANNOT_RECHARGE_SELLER");
        }

        if (String((targetUser as any)._id) === String((sellerDoc as any)._id)) {
            return sendResponse(res, 400, false, "You cannot recharge your own seller account.", undefined, undefined, "CANNOT_RECHARGE_SELF");
        }

        // Pricing Configuration Calculation (Server Authoritative)
        const pricingConfig = await getActiveSellerPricing();
        const userRate = pricingConfig.userDiamondsPerRupee || 16.7;
        const discountFactor = pricingConfig.sellerDiscountFactor || 0.95;

        // Financial values (Server derived)
        const customerAmount = Math.round(numDiamonds / userRate);
        const sellerCost = Math.round((numDiamonds * discountFactor) / userRate);
        const profitAmount = Math.max(0, customerAmount - sellerCost);

        const txId = `STX${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
        const ledgerId = `LED${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
        const cleanIdempotencyKey = idempotencyKey && String(idempotencyKey).trim() ? String(idempotencyKey).trim() : `IK_${txId}`;

        // Atomic Transaction Execution
        const result = await runWithTransaction(async (session) => {
            const opts = session ? { session } : {};

            // 1. Atomic debit seller stock with condition (diamonds >= numDiamonds)
            const updatedSeller = await User.findOneAndUpdate(
                { _id: sellerDoc._id, diamonds: { $gte: numDiamonds } },
                { $inc: { diamonds: -numDiamonds } },
                { new: true, ...opts }
            );

            if (!updatedSeller) {
                throw new Error("INSUFFICIENT_STOCK: Seller stock balance changed concurrently");
            }

            const sellerClosingBalance = updatedSeller.diamonds || 0;
            const sellerOpeningBalance = sellerClosingBalance + numDiamonds;

            // 2. Atomic credit target user
            const updatedUser = await User.findByIdAndUpdate(
                targetUser._id,
                { $inc: { diamonds: numDiamonds } },
                { new: true, ...opts }
            );

            if (!updatedUser) {
                throw new Error("USER_NOT_FOUND: Target user could not be updated");
            }

            // 3. Create Seller Transaction record
            const [transaction] = await SellerTransaction.create(
                [{
                    transactionId: txId,
                    sellerId: sellerDoc.userId,
                    sellerObjectId: sellerDoc._id,
                    userId: targetUser.userId,
                    userObjectId: targetUser._id,
                    transactionType: 'USER_RECHARGE',
                    diamonds: numDiamonds,
                    sellerCost,
                    customerAmount,
                    profitAmount,
                    balanceBefore: sellerOpeningBalance,
                    balanceAfter: sellerClosingBalance,
                    status: 'SUCCESS',
                    idempotencyKey: cleanIdempotencyKey,
                    referenceId: txId,
                    metadata: {
                        targetUserName: targetUser.name,
                        targetMeethiId: targetUser.meethiId
                    }
                }],
                opts
            );

            // 4. Create Seller Ledger Entry
            await SellerLedger.create(
                [{
                    ledgerId,
                    sellerId: sellerDoc.userId,
                    sellerObjectId: sellerDoc._id,
                    transactionType: 'USER_RECHARGE',
                    openingBalance: sellerOpeningBalance,
                    credit: 0,
                    debit: numDiamonds,
                    closingBalance: sellerClosingBalance,
                    transactionId: txId,
                    transactionObjectId: transaction._id,
                    targetUserId: targetUser.userId,
                    sellerCost,
                    customerAmount,
                    profitAmount,
                    rateSnapshot: {
                        userDiamondsPerRupee: userRate,
                        sellerDiscountFactor: discountFactor,
                        sellerCost,
                        customerPrice: customerAmount
                    }
                }],
                opts
            );

            // 5. Create general RechargeHistory record
            await RechargeHistory.create(
                [{
                    userId: targetUser.userId,
                    userObjectId: targetUser._id,
                    diamonds: numDiamonds,
                    coins: 0,
                    amount: sellerCost,
                    type: 'seller_credit',
                    paymentGateway: 'seller_portal',
                    date: new Date()
                }],
                opts
            );

            // 6. Record Audit Log
            await AuditLog.create(
                [{
                    adminId: sellerDoc._id,
                    action: 'SELLER_USER_RECHARGE',
                    target: `User #${targetUser.userId} (${targetUser.name})`,
                    details: `Seller ${sellerDoc.userId} credited 💎 ${numDiamonds.toLocaleString()} to User #${targetUser.userId} (Cost: ₹${sellerCost}, Customer Amt: ₹${customerAmount}, Profit: ₹${profitAmount})`,
                    ipAddress: req.ip || '127.0.0.1',
                    userAgent: req.headers['user-agent']
                }],
                opts
            );

            return {
                txId,
                userId: targetUser.userId,
                userName: targetUser.name,
                meethiId: targetUser.meethiId,
                diamonds: numDiamonds,
                customerAmount,
                sellerCost,
                profitAmount,
                sellerRemainingStock: sellerClosingBalance,
                date: transaction.createdAt.toLocaleString()
            };
        });

        return sendResponse(res, 200, true, `Successfully credited 💎 ${numDiamonds.toLocaleString()} to ${targetUser.name}`, {
            receipt: result
        });

    } catch (error: any) {
        console.error("Seller Recharge Error:", error);
        const errMsg = error?.message || "Recharge transaction failed";
        if (errMsg.includes("INSUFFICIENT_STOCK")) {
            return sendResponse(res, 400, false, "Insufficient diamond stock in seller wallet", undefined, undefined, "INSUFFICIENT_STOCK");
        }
        return sendResponse(res, 500, false, errMsg);
    }
};

/**
 * 3. Seller Dashboard Overview API
 * GET /api/seller/dashboard
 */
export const getSellerDashboard = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const sellerDoc = await User.findById(sellerAuth.id).select('userId name diamonds status role');
        if (!sellerDoc) {
            return sendResponse(res, 404, false, "Seller not found");
        }

        const sellerId = sellerDoc.userId;

        // Date ranges for Aggregation
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Run parallel aggregations for high speed
        const [todayAgg, monthAgg, uniqueUsers, recentTx] = await Promise.all([
            // Today's sales aggregation
            SellerTransaction.aggregate([
                { $match: { sellerId, transactionType: 'USER_RECHARGE', status: 'SUCCESS', createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, totalDiamonds: { $sum: '$diamonds' }, totalInr: { $sum: '$customerAmount' }, totalProfit: { $sum: '$profitAmount' }, count: { $sum: 1 } } }
            ]),
            // Monthly sales aggregation
            SellerTransaction.aggregate([
                { $match: { sellerId, transactionType: 'USER_RECHARGE', status: 'SUCCESS', createdAt: { $gte: startOfMonth } } },
                { $group: { _id: null, totalDiamonds: { $sum: '$diamonds' }, totalInr: { $sum: '$customerAmount' }, totalProfit: { $sum: '$profitAmount' }, count: { $sum: 1 } } }
            ]),
            // Total unique recharged users
            SellerTransaction.distinct('userId', { sellerId, transactionType: 'USER_RECHARGE', status: 'SUCCESS' }),
            // Recent transactions
            SellerTransaction.find({ sellerId }).sort({ createdAt: -1 }).limit(5).lean()
        ]);

        const todayStats = todayAgg[0] || { totalDiamonds: 0, totalInr: 0, totalProfit: 0, count: 0 };
        const monthStats = monthAgg[0] || { totalDiamonds: 0, totalInr: 0, totalProfit: 0, count: 0 };

        return sendResponse(res, 200, true, "Seller dashboard loaded", {
            stats: {
                stockBalance: sellerDoc.diamonds || 0,
                todaySalesDiamonds: todayStats.totalDiamonds,
                todaySalesInr: todayStats.totalInr,
                todayProfitInr: todayStats.totalProfit,
                todayTransfersCount: todayStats.count,
                monthlySalesDiamonds: monthStats.totalDiamonds,
                monthlySalesInr: monthStats.totalInr,
                monthlyProfitInr: monthStats.totalProfit,
                monthlyTransfersCount: monthStats.count,
                totalCustomers: uniqueUsers.length
            },
            recentTransactions: recentTx
        });
    } catch (error: any) {
        console.error("Error loading seller dashboard:", error);
        return sendResponse(res, 500, false, error.message || "Failed to load seller dashboard");
    }
};

/**
 * 4. Seller Transaction History API (Paginated & Filtered)
 * GET /api/seller/history
 */
export const getSellerHistory = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const sellerId = sellerAuth.userId;
        const { search, page = 1, limit = 20, type, status, fromDate, toDate } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const query: any = { sellerId };

        if (type) query.transactionType = type;
        if (status) query.status = status;

        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate as string);
            if (toDate) query.createdAt.$lte = new Date(toDate as string);
        }

        if (search && String(search).trim()) {
            const searchStr = String(search).trim();
            const searchNum = parseInt(searchStr, 10);
            query.$or = [
                { transactionId: { $regex: searchStr, $options: 'i' } },
                ...(isNaN(searchNum) ? [] : [{ userId: searchNum }])
            ];
        }

        const [history, total] = await Promise.all([
            SellerTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            SellerTransaction.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "Seller transaction history fetched", {
            history,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        console.error("Error fetching seller history:", error);
        return sendResponse(res, 500, false, error.message || "Failed to fetch transaction history");
    }
};

/**
 * 5. Seller Profit & Ledger Statement API
 * GET /api/seller/ledger
 */
export const getSellerLedger = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const sellerId = sellerAuth.userId;
        const { page = 1, limit = 20, fromDate, toDate } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const query: any = { sellerId };
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) query.createdAt.$gte = new Date(fromDate as string);
            if (toDate) query.createdAt.$lte = new Date(toDate as string);
        }

        const [ledgerEntries, total, summaryAgg] = await Promise.all([
            SellerLedger.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            SellerLedger.countDocuments(query),
            SellerLedger.aggregate([
                { $match: { sellerId } },
                {
                    $group: {
                        _id: null,
                        totalCredit: { $sum: '$credit' },
                        totalDebit: { $sum: '$debit' },
                        totalSellerCost: { $sum: '$sellerCost' },
                        totalCustomerAmount: { $sum: '$customerAmount' },
                        totalProfit: { $sum: '$profitAmount' }
                    }
                }
            ])
        ]);

        const sellerDoc = await User.findOne({ userId: sellerId }).select('diamonds');

        const summary = summaryAgg[0] || { totalCredit: 0, totalDebit: 0, totalSellerCost: 0, totalCustomerAmount: 0, totalProfit: 0 };

        return sendResponse(res, 200, true, "Seller ledger statement loaded", {
            ledgerEntries,
            summary: {
                currentStockBalance: sellerDoc?.diamonds || 0,
                totalStockPurchased: summary.totalCredit,
                totalStockSold: summary.totalDebit,
                totalSellerCostInr: summary.totalSellerCost,
                totalCustomerAmountInr: summary.totalCustomerAmount,
                netProfitInr: summary.totalProfit
            },
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        console.error("Error fetching seller ledger:", error);
        return sendResponse(res, 500, false, error.message || "Failed to fetch ledger statement");
    }
};

/**
 * 6. Seller Stock Purchase Request (Submit Request)
 * POST /api/seller/stock/request
 */
export const requestStockBySeller = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const sellerDoc = await User.findById(sellerAuth.id);
        if (!sellerDoc || sellerDoc.isDeleted) {
            return sendResponse(res, 401, false, "Seller profile not found");
        }

        const { diamonds, payableAmount, packageId, paymentMethod, utrNumber, paymentSlipUrl, notes } = req.body;

        if (!diamonds || Number(diamonds) <= 0) {
            return sendResponse(res, 400, false, "Diamonds quantity is required");
        }

        if (!utrNumber || !String(utrNumber).trim()) {
            return sendResponse(res, 400, false, "UTR / Payment Transaction Reference Number is required");
        }

        const numDiamonds = Number(diamonds);
        const numPayable = Number(payableAmount) || Math.round((numDiamonds * 0.95) / 16.7);
        const reqId = `SREQ${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

        const stockReq = await SellerStockRequest.create({
            requestId: reqId,
            sellerId: sellerDoc.userId,
            sellerObjectId: sellerDoc._id,
            sellerCode: sellerDoc.employeeCode || `SEL${sellerDoc.userId}`,
            sellerName: sellerDoc.name || 'Seller',
            diamonds: numDiamonds,
            payableAmount: numPayable,
            packageId: packageId || '',
            paymentMethod: paymentMethod || 'UPI',
            utrNumber: String(utrNumber).trim().toUpperCase(),
            paymentSlipUrl: paymentSlipUrl || '',
            notes: notes || '',
            status: 'PENDING'
        });

        // Sync EMS RequestModel so submission appears in Admin EMS Request table
        try {
            await RequestModel.create({
                requestType: 'Seller Request',
                role: 'coinSeller',
                data: {
                    name: sellerDoc.name || 'Seller',
                    merchantName: sellerDoc.name || 'Seller',
                    email: sellerDoc.email || '',
                    mobile: sellerDoc.phoneNumber || '',
                    phoneNumber: sellerDoc.phoneNumber || '',
                    sellerCode: sellerDoc.employeeCode || `SEL${sellerDoc.userId}`,
                    userId: sellerDoc.userId,
                    meethiChatId: sellerDoc.meethiId || `MC${sellerDoc.userId}`,
                    diamonds: numDiamonds,
                    payableAmount: numPayable,
                    utrNumber: String(utrNumber).trim().toUpperCase(),
                    packageId: packageId || '',
                    paymentMethod: paymentMethod || 'UPI',
                    notes: notes || '',
                    sellerStockRequestId: stockReq._id,
                    requestId: reqId
                },
                status: RequestStatus.PENDING,
                createdBy: String(sellerDoc._id),
                createdByRole: 'coinSeller'
            });
        } catch (reqErr) {
            console.error('RequestModel sync error for stock request:', reqErr);
        }

        await AuditLog.create({
            adminId: sellerDoc._id,
            action: 'SELLER_STOCK_REQUEST_SUBMITTED',
            target: `Stock Request #${reqId}`,
            details: `Submitted stock request for 💎 ${numDiamonds.toLocaleString()} (Payable: ₹${numPayable}, UTR: ${utrNumber})`,
            ipAddress: req.ip || '127.0.0.1'
        });

        return sendResponse(res, 201, true, "Stock purchase request submitted successfully. Admin approval pending.", {
            stockRequest: stockReq
        });
    } catch (error: any) {
        console.error("Error submitting stock request:", error);
        return sendResponse(res, 500, false, error.message || "Failed to submit stock request");
    }
};

/**
 * 7. Get Seller's Stock Requests
 * GET /api/seller/stock/requests
 */
export const getSellerStockRequests = async (req: AuthRequest, res: Response) => {
    try {
        const sellerAuth = req.user;
        if (!sellerAuth) {
            return sendResponse(res, 401, false, "Unauthorized");
        }

        const { page = 1, limit = 20, status } = req.query;
        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const query: any = { sellerId: sellerAuth.userId };
        if (status) query.status = status;

        const [requests, total] = await Promise.all([
            SellerStockRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            SellerStockRequest.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "Stock requests fetched", {
            requests,
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error: any) {
        console.error("Error fetching stock requests:", error);
        return sendResponse(res, 500, false, error.message || "Failed to fetch stock requests");
    }
};

/**
 * 8. Get Seller Pricing Configuration
 * GET /api/seller/config
 */
export const getSellerConfig = async (req: AuthRequest, res: Response) => {
    try {
        const config = await getActiveSellerPricing();
        return sendResponse(res, 200, true, "Seller pricing configuration retrieved", { config });
    } catch (error: any) {
        console.error("Error getting seller config:", error);
        return sendResponse(res, 500, false, error.message || "Failed to load pricing config");
    }
};
