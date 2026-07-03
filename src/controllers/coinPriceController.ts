import { Request, Response } from "express";
import { Logger } from "../utils/logger";
import { PricePlan } from "../models/coinsPrice.model";
import sendResponse from "../utils/reponse";
import { AuthRequest } from "../middlewares/authorize.middleware";
import { UserRole } from "../constants/user";

export const addPricePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role as any)) {
      return sendResponse(res, 403, false, "Forbidden: Access denied");
    }

    const { description, actualPrice, discountedPrice = 0, coins, type } = req.body;

    if (!description || !actualPrice || !coins || !type) {
      return sendResponse(
        res,
        400,
        false,
        "Required fields: description, actualPrice, coins, type"
      );
    }

    const newPlan = await PricePlan.create({
      description,
      actualPrice,
      discountedPrice,
      coins,
      type,
    });

    if (!newPlan) {
      return sendResponse(res, 400, false, "Price plan is not added");
    }

    return sendResponse(res, 201, true, "Price plan added successfully", newPlan);
  } catch (error: any) {
    await Logger("addPricePlan", error);
    return sendResponse(res, 500, false, "Something went wrong", error?.message || error);
  }
};

export const getAllPricePlans = async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.query; // 👈 filter by type if provided
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (type) query.type = type; // filter only offline/online plans

    const [plans, total] = await Promise.all([
      PricePlan.find(query).sort({ actualPrice: 1 }).skip(skip).limit(limit),
      PricePlan.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return sendResponse(
      res,
      200,
      true,
      total ? "Price plans fetched successfully" : "No price plans found",
      {
        plans,
        pagination: { total, page, limit, totalPages },
      }
    );
  } catch (error: any) {
    await Logger("getAllPricePlans", error);
    return sendResponse(res, 500, false, "Failed to get price plans", error.message);
  }
};

export const getPricePlanById = async (req: Request, res: Response) => {
  try {
    const plan = await PricePlan.findById(req.params.id);
    if (!plan) {
      return sendResponse(res, 404, false, "Price plan not found");
    }
    return sendResponse(res, 200, true, "Price plan fetched successfully", plan);
  } catch (error: any) {
    await Logger("getPricePlanById", error);
    return sendResponse(res, 500, false, "Failed to fetch price plan", error.message);
  }
};

export const updatePricePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role as any)) {
      return sendResponse(res, 403, false, "Forbidden: Access denied");
    }

    const { description, actualPrice, discountedPrice = 0, coins, type } = req.body;

    const updatedPlan = await PricePlan.findByIdAndUpdate(
      req.params.id,
      { description, actualPrice, discountedPrice, coins, type },
      { new: true }
    );

    if (!updatedPlan) {
      return sendResponse(res, 404, false, "Price plan not found");
    }

    return sendResponse(res, 200, true, "Price plan updated successfully", updatedPlan);
  } catch (error: any) {
    await Logger("updatePricePlan", error);
    return sendResponse(res, 500, false, "Failed to update price plan", error.message);
  }
};

export const deletePricePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.user || {};
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(role as any)) {
      return sendResponse(res, 403, false, "Forbidden: Access denied");
    }

    const deletedPlan = await PricePlan.findByIdAndDelete(req.params.id);
    if (!deletedPlan) {
      return sendResponse(res, 404, false, "Price plan not found");
    }

    return sendResponse(res, 200, true, "Price plan deleted successfully");
  } catch (error: any) {
    await Logger("deletePricePlan", error);
    return sendResponse(res, 500, false, "Failed to delete price plan", error.message);
  }
};

