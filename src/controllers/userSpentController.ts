import { Request, Response } from 'express';


import { Logger } from '../utils/logger';

import { AuthRequest } from '../middlewares/authorize.middleware';
import sendResponse from '../utils/reponse';
import { CoinsTransaction } from '../models/spentCoinModel';
import { TransactionType, UserRole } from '../constants/user';

// Add a transaction
export const addTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, hostId, type, coinsSpent, hostEarning } = req.body;

    if (!userId || !hostId || !type || !coinsSpent || !hostEarning) {
      return sendResponse(res, 400, false, "Required fields: userId, hostId, type, coinsSpent, hostEarning");
    }

    if (!Object.values(TransactionType).includes(type)) {
      return sendResponse(res, 400, false, "Invalid transaction type");
    }

    const transaction = await CoinsTransaction.create({
      userId,
      hostId,
      type,
      coinsSpent,
      hostEarning
    });

    return sendResponse(res, 201, true, "Transaction added successfully", transaction);
  } catch (error: any) {
    await Logger("addTransaction", error);
    return sendResponse(res, 500, false, "Failed to add transaction", error?.message || error);
  }
};

// Get all transactions (paginated)
export const getAllTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const { role, id } = req.user || {}; // 👈 use _id from token
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Role-based filter
    let filter: any = {};
    if (role === UserRole.USER) {
      filter.userId = id;   // user → only their spends
    } else if (role === UserRole.HOST) {
      filter.hostId = id;   // host → only their earnings
    }
    // Admin → no filter → sees all

    const [transactions, total] = await Promise.all([
      CoinsTransaction.find(filter)
        .populate("userId", "userId name image")   // spender info
        .populate("hostId", "userId name image")   // host info
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoinsTransaction.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Format response
    const formatted = transactions.map(tx => {
      const base = {
        caller: {
          id: tx.userId && typeof tx.userId === "object" ? (tx.userId as any).userId : null,
          name: tx.userId && typeof tx.userId === "object" ? (tx.userId as any).name : null,
          image: tx.userId && typeof tx.userId === "object" ? (tx.userId as any).image : null,
        },
        host: {
          id: tx.hostId && typeof tx.hostId === "object" ? (tx.hostId as any).userId : null,
          name: tx.hostId && typeof tx.hostId === "object" ? (tx.hostId as any).name : null,
          image: tx.hostId && typeof tx.hostId === "object" ? (tx.hostId as any).image : null,
        },
        type: tx.type,
        start: tx.callStart ? tx.callStart.toLocaleTimeString() : null,
        end: tx.callEnd ? tx.callEnd.toLocaleTimeString() : null,
        duration: tx.duration || 0,
        date: tx.createdAt.toLocaleDateString("en-GB"),
      };

      if (role === UserRole.USER) {
        return {
          ...base,
          coinsSpent: tx.coinsSpent || 0,  // 👈 user sees spends
        };
      } else if (role === UserRole.HOST) {
        return {
          ...base,
          earning: tx.hostEarning || 0,    // 👈 host sees earnings
        };
      } else {
        return {
          ...base,
          coinsSpent: tx.coinsSpent || 0,
          earning: tx.hostEarning || 0,    // 👈 admin sees both
        };
      }
    });

    return sendResponse(
      res,
      200,
      true,
      total ? "Transactions fetched successfully" : "No transactions found",
      {
        transactions: formatted,
        pagination: { total, page, limit, totalPages },
      }
    );
  } catch (error: any) {
    await Logger("getAllTransactions", error);
    return sendResponse(
      res,
      500,
      false,
      "Failed to get transactions",
      error?.message || error
    );
  }
};

// Get single transaction by ID
export const getTransactionById = async (req: Request, res: Response) => {
  try {
    const transaction = await CoinsTransaction.findById(req.params.id);
    if (!transaction) {
      return sendResponse(res, 404, false, "Transaction not found");
    }
    return sendResponse(res, 200, true, "Transaction fetched successfully", transaction);
  } catch (error: any) {
    await Logger("getTransactionById", error);
    return sendResponse(res, 500, false, "Failed to fetch transaction", error?.message || error);
  }
};

// Delete a transaction (admin only)
export const deleteTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (!["superAdmin", "admin"].includes(role!)) {
      return sendResponse(res, 403, false, "Forbidden: Access denied");
    }

    const deleted = await CoinsTransaction.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendResponse(res, 404, false, "Transaction not found");
    }

    return sendResponse(res, 200, true, "Transaction deleted successfully");
  } catch (error: any) {
    await Logger("deleteTransaction", error);
    return sendResponse(res, 500, false, "Failed to delete transaction", error?.message || error);
  }
};
