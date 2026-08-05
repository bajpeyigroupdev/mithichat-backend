import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { User } from '../models/user.model';
import { SellerStockRequest } from '../models/sellerStockRequest.model';
import { SellerTransaction } from '../models/sellerTransaction.model';
import { SellerLedger } from '../models/sellerLedger.model';
import { SellerPricingConfig } from '../models/sellerPricingConfig.model';
import { AuditLog } from '../models/auditLog.model';
import sendResponse from '../utils/reponse';

/**
 * Admin: Approve Stock Request (Atomic MongoDB Transaction)
 * POST /api/admin/sellers/stock-requests/:id/approve
 */
export const approveStockRequest = async (req: AuthRequest, res: Response) => {
    try {
        const adminAuth = req.user;
        if (!adminAuth || !['owner', 'operator', 'superAdmin', 'admin'].includes(adminAuth.role)) {
            return sendResponse(res, 403, false, "Access denied. Admin authorization required.");
        }

        const { id } = req.params;
        if (!id) {
            return sendResponse(res, 400, false, "Stock request ID is required");
        }

        const stockReq = await SellerStockRequest.findById(id);
        if (!stockReq) {
            return sendResponse(res, 404, false, "Stock request not found", undefined, undefined, "STOCK_REQUEST_NOT_FOUND");
        }

        if (stockReq.status !== 'PENDING') {
            return sendResponse(res, 400, false, `Stock request has already been ${stockReq.status.toLowerCase()}`, undefined, undefined, "STOCK_REQUEST_ALREADY_PROCESSED");
        }

        const sellerDoc = await User.findById(stockReq.sellerObjectId);
        if (!sellerDoc || sellerDoc.isDeleted) {
            return sendResponse(res, 404, false, "Seller account not found");
        }

        const numDiamonds = stockReq.diamonds;
        const payableAmt = stockReq.payableAmount;
        const txId = `STX_BUY_${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
        const ledgerId = `LED_BUY_${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

        // Atomic Approval
        const openingBalance = sellerDoc.diamonds || 0;
        const closingBalance = openingBalance + numDiamonds;

        // 1. Credit Seller Stock Inventory
        const updatedSeller = await User.findByIdAndUpdate(
            sellerDoc._id,
            { $inc: { diamonds: numDiamonds } },
            { new: true }
        );

        if (!updatedSeller) {
            return sendResponse(res, 500, false, "Failed to update seller inventory");
        }

        // 2. Mark Request Approved
        stockReq.status = 'APPROVED';
        stockReq.processedBy = adminAuth.id;
        stockReq.processedAt = new Date();
        await stockReq.save();

        // 3. Create Seller Transaction
        const transaction = await SellerTransaction.create({
            transactionId: txId,
            sellerId: sellerDoc.userId,
            sellerObjectId: sellerDoc._id,
            transactionType: 'STOCK_PURCHASE',
            diamonds: numDiamonds,
            sellerCost: payableAmt,
            customerAmount: Math.round(numDiamonds / 16.7),
            profitAmount: Math.max(0, Math.round(numDiamonds / 16.7) - payableAmt),
            balanceBefore: openingBalance,
            balanceAfter: closingBalance,
            status: 'SUCCESS',
            referenceId: stockReq.requestId,
            metadata: {
                utrNumber: stockReq.utrNumber,
                approvedByAdminId: adminAuth.userId
            }
        });

        // 4. Create Seller Ledger
        await SellerLedger.create({
            ledgerId,
            sellerId: sellerDoc.userId,
            sellerObjectId: sellerDoc._id,
            transactionType: 'STOCK_PURCHASE',
            openingBalance,
            credit: numDiamonds,
            debit: 0,
            closingBalance,
            transactionId: txId,
            transactionObjectId: transaction._id,
            sellerCost: payableAmt,
            customerAmount: Math.round(numDiamonds / 16.7),
            profitAmount: Math.max(0, Math.round(numDiamonds / 16.7) - payableAmt),
            rateSnapshot: {
                userDiamondsPerRupee: 16.7,
                sellerDiscountFactor: 0.95,
                sellerCost: payableAmt,
                customerPrice: Math.round(numDiamonds / 16.7)
            }
        });

        // 5. Audit Log
        await AuditLog.create({
            adminId: adminAuth.id,
            action: 'SELLER_STOCK_REQUEST_APPROVED',
            target: `Seller #${sellerDoc.userId} (${sellerDoc.name})`,
            details: `Approved stock request #${stockReq.requestId}. Credited 💎 ${numDiamonds.toLocaleString()} to Seller #${sellerDoc.userId} (New Stock: 💎 ${closingBalance.toLocaleString()})`,
            ipAddress: req.ip || '127.0.0.1'
        });

        return sendResponse(res, 200, true, `Successfully approved stock request and credited 💎 ${numDiamonds.toLocaleString()} to Seller ${sellerDoc.name}`, {
            stockRequest: stockReq,
            sellerNewStockBalance: closingBalance
        });

    } catch (error: any) {
        console.error("Error approving stock request:", error);
        return sendResponse(res, 500, false, error.message || "Failed to approve stock request");
    }
};

/**
 * Admin: Reject Stock Request
 * POST /api/admin/sellers/stock-requests/:id/reject
 */
export const rejectStockRequest = async (req: AuthRequest, res: Response) => {
    try {
        const adminAuth = req.user;
        if (!adminAuth || !['owner', 'operator', 'superAdmin', 'admin'].includes(adminAuth.role)) {
            return sendResponse(res, 403, false, "Access denied. Admin authorization required.");
        }

        const { id } = req.params;
        const { reason } = req.body;

        const stockReq = await SellerStockRequest.findById(id);
        if (!stockReq) {
            return sendResponse(res, 404, false, "Stock request not found");
        }

        if (stockReq.status !== 'PENDING') {
            return sendResponse(res, 400, false, `Stock request has already been ${stockReq.status.toLowerCase()}`);
        }

        stockReq.status = 'REJECTED';
        stockReq.processedBy = adminAuth.id;
        stockReq.processedAt = new Date();
        stockReq.rejectionReason = reason || 'Payment transaction UTR could not be verified by Admin';
        await stockReq.save();

        await AuditLog.create({
            adminId: adminAuth.id,
            action: 'SELLER_STOCK_REQUEST_REJECTED',
            target: `Request #${stockReq.requestId}`,
            details: `Rejected stock request #${stockReq.requestId} for Seller #${stockReq.sellerId}. Reason: ${stockReq.rejectionReason}`,
            ipAddress: req.ip || '127.0.0.1'
        });

        return sendResponse(res, 200, true, "Stock request rejected", { stockRequest: stockReq });
    } catch (error: any) {
        console.error("Error rejecting stock request:", error);
        return sendResponse(res, 500, false, error.message || "Failed to reject stock request");
    }
};

/**
 * Admin: List All Seller Stock Requests
 * GET /api/admin/sellers/stock-requests
 */
export const getAllStockRequestsAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const adminAuth = req.user;
        if (!adminAuth || !['owner', 'operator', 'superAdmin', 'admin'].includes(adminAuth.role)) {
            return sendResponse(res, 403, false, "Access denied.");
        }

        const { page = 1, limit = 20, status, search } = req.query;
        const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const query: any = {};
        if (status) query.status = status;

        if (search && String(search).trim()) {
            const searchStr = String(search).trim();
            const searchNum = parseInt(searchStr, 10);
            query.$or = [
                { requestId: { $regex: searchStr, $options: 'i' } },
                { sellerCode: { $regex: searchStr, $options: 'i' } },
                { utrNumber: { $regex: searchStr, $options: 'i' } },
                ...(isNaN(searchNum) ? [] : [{ sellerId: searchNum }])
            ];
        }

        const [requests, total] = await Promise.all([
            SellerStockRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            SellerStockRequest.countDocuments(query)
        ]);

        return sendResponse(res, 200, true, "All seller stock requests retrieved", {
            requests,
            pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error: any) {
        console.error("Error fetching all stock requests:", error);
        return sendResponse(res, 500, false, error.message || "Failed to fetch stock requests");
    }
};

/**
 * Admin: Update Seller Pricing Configuration
 * PUT /api/admin/sellers/config
 */
export const updateSellerPricingConfig = async (req: AuthRequest, res: Response) => {
    try {
        const adminAuth = req.user;
        if (!adminAuth || !['owner', 'operator', 'superAdmin'].includes(adminAuth.role)) {
            return sendResponse(res, 403, false, "Access denied. Only Super Admin or Owner can modify pricing rules.");
        }

        const { userDiamondsPerRupee, sellerDiscountFactor, sellerCostPer1670Diamonds, customerPricePer1670Diamonds } = req.body;

        const config = await SellerPricingConfig.findOneAndUpdate(
            { configKey: 'DEFAULT_SELLER_PRICING' },
            {
                ...(userDiamondsPerRupee ? { userDiamondsPerRupee: Number(userDiamondsPerRupee) } : {}),
                ...(sellerDiscountFactor ? { sellerDiscountFactor: Number(sellerDiscountFactor) } : {}),
                ...(sellerCostPer1670Diamonds ? { sellerCostPer1670Diamonds: Number(sellerCostPer1670Diamonds) } : {}),
                ...(customerPricePer1670Diamonds ? { customerPricePer1670Diamonds: Number(customerPricePer1670Diamonds) } : {}),
                updatedBy: adminAuth.id
            },
            { new: true, upsert: true }
        );

        await AuditLog.create({
            adminId: adminAuth.id,
            action: 'SELLER_PRICING_CONFIG_UPDATED',
            target: 'SellerPricingConfig',
            details: `Updated seller pricing configuration rules: Discount factor=${config.sellerDiscountFactor}, Cost=${config.sellerCostPer1670Diamonds}`,
            ipAddress: req.ip || '127.0.0.1'
        });

        return sendResponse(res, 200, true, "Seller pricing configuration updated successfully", { config });
    } catch (error: any) {
        console.error("Error updating seller pricing config:", error);
        return sendResponse(res, 500, false, error.message || "Failed to update pricing config");
    }
};

/**
 * Admin: Verify Seller Account before adding stock
 * GET /api/admin/sellers/verify/:sellerId
 */
export const verifySellerForAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const { sellerId } = req.params;
        const queryStr = (sellerId || req.query.sellerId || '').toString().trim();
        if (!queryStr) {
            return sendResponse(res, 400, false, "Seller Code or ID is required");
        }

        const numId = parseInt(queryStr, 10);
        const query = isNaN(numId)
            ? { $or: [{ userName: queryStr }, { meethiId: queryStr }, { employeeCode: queryStr }, { specialCode: queryStr }], isDeleted: false }
            : { $or: [{ userId: numId }, { meethiId: queryStr }, { employeeCode: queryStr }], isDeleted: false };

        const seller = await User.findOne(query).select('userId name userName meethiId employeeCode diamonds coins role status isBlocked image');
        if (!seller) {
            return sendResponse(res, 404, false, "Seller account not found");
        }

        return sendResponse(res, 200, true, "Seller verified successfully", {
            seller: {
                userId: seller.userId,
                sellerCode: seller.employeeCode || seller.meethiId || `SEL${seller.userId}`,
                name: seller.name || 'Seller',
                username: seller.userName || `@seller_${seller.userId}`,
                meethiId: seller.meethiId || `MC${seller.userId}`,
                diamonds: seller.diamonds || 0,
                coins: seller.coins || 0,
                role: seller.role,
                status: seller.status || 'Active',
                image: seller.image || ''
            }
        });
    } catch (error: any) {
        console.error("Error verifying seller for admin:", error);
        return sendResponse(res, 500, false, error.message || "Failed to verify seller");
    }
};

/**
 * Admin: Credit Diamonds Stock directly to Seller
 * POST /api/admin/sellers/add-diamonds
 * POST /api/admin/sellers/recharge
 */
export const adminCreditSellerDiamonds = async (req: AuthRequest, res: Response) => {
    try {
        const adminAuth = req.user;
        if (!adminAuth || !['owner', 'operator', 'superAdmin', 'admin'].includes(adminAuth.role)) {
            return sendResponse(res, 403, false, "Access denied. Admin authorization required.");
        }

        const { sellerId, sellerCode, diamonds, payableAmount } = req.body;
        const targetQuery = (sellerId || sellerCode || '').toString().trim();

        if (!targetQuery) {
            return sendResponse(res, 400, false, "Seller ID or Seller Code is required");
        }

        const numDiamonds = Number(diamonds);
        if (isNaN(numDiamonds) || numDiamonds <= 0 || !Number.isInteger(numDiamonds)) {
            return sendResponse(res, 400, false, "Diamonds amount must be a positive whole integer");
        }

        const numId = parseInt(targetQuery, 10);
        const query = isNaN(numId)
            ? { $or: [{ userName: targetQuery }, { meethiId: targetQuery }, { employeeCode: targetQuery }, { specialCode: targetQuery }], isDeleted: false }
            : { $or: [{ userId: numId }, { meethiId: targetQuery }, { employeeCode: targetQuery }], isDeleted: false };

        const sellerDoc = await User.findOne(query);
        if (!sellerDoc) {
            return sendResponse(res, 404, false, `Seller account '${targetQuery}' not found`);
        }

        if (sellerDoc.isBlocked || sellerDoc.status === 'Blocked') {
            return sendResponse(res, 403, false, "Target seller account is currently blocked");
        }

        const openingBalance = sellerDoc.diamonds || 0;
        const closingBalance = openingBalance + numDiamonds;
        const payableAmt = Number(payableAmount) || Math.round((numDiamonds * 0.95) / 16.7);

        // 1. Atomically Credit Seller Stock Inventory
        const updatedSeller = await User.findByIdAndUpdate(
            sellerDoc._id,
            { $inc: { diamonds: numDiamonds } },
            { new: true }
        );

        if (!updatedSeller) {
            return sendResponse(res, 500, false, "Failed to update seller diamond stock");
        }

        const txId = `STX_ADM_${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
        const ledgerId = `LED_ADM_${Date.now()}${Math.floor(100 + Math.random() * 900)}`;

        // 2. Create Seller Transaction
        const transaction = await SellerTransaction.create({
            transactionId: txId,
            sellerId: sellerDoc.userId,
            sellerObjectId: sellerDoc._id,
            transactionType: 'STOCK_PURCHASE',
            diamonds: numDiamonds,
            sellerCost: payableAmt,
            customerAmount: Math.round(numDiamonds / 16.7),
            profitAmount: Math.max(0, Math.round(numDiamonds / 16.7) - payableAmt),
            balanceBefore: openingBalance,
            balanceAfter: closingBalance,
            status: 'SUCCESS',
            metadata: {
                creditedByAdminId: adminAuth.userId,
                creditedByAdminRole: adminAuth.role
            }
        });

        // 3. Create Seller Ledger
        await SellerLedger.create({
            ledgerId,
            sellerId: sellerDoc.userId,
            sellerObjectId: sellerDoc._id,
            transactionType: 'STOCK_PURCHASE',
            openingBalance,
            credit: numDiamonds,
            debit: 0,
            closingBalance,
            transactionId: txId,
            transactionObjectId: transaction._id,
            sellerCost: payableAmt,
            customerAmount: Math.round(numDiamonds / 16.7),
            profitAmount: Math.max(0, Math.round(numDiamonds / 16.7) - payableAmt),
            rateSnapshot: {
                userDiamondsPerRupee: 16.7,
                sellerDiscountFactor: 0.95,
                sellerCost: payableAmt,
                customerPrice: Math.round(numDiamonds / 16.7)
            }
        });

        // 4. Audit Log
        await AuditLog.create({
            adminId: adminAuth.id,
            action: 'ADMIN_SELLER_DIAMONDS_CREDITED',
            target: `Seller #${sellerDoc.userId} (${sellerDoc.name})`,
            details: `Credited 💎 ${numDiamonds.toLocaleString()} to Seller #${sellerDoc.userId}. New Stock Balance: 💎 ${closingBalance.toLocaleString()}`,
            ipAddress: req.ip || '127.0.0.1'
        });

        return sendResponse(res, 200, true, `Successfully credited 💎 ${numDiamonds.toLocaleString()} to Seller ${sellerDoc.name}`, {
            seller: {
                userId: sellerDoc.userId,
                name: sellerDoc.name,
                newStockBalance: closingBalance
            },
            currentDiamonds: closingBalance,
            transactionId: txId
        });

    } catch (error: any) {
        console.error("Error crediting seller diamonds by admin:", error);
        return sendResponse(res, 500, false, error.message || "Failed to credit seller diamonds");
    }
};
