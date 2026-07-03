import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { verifySecureHash, generateSecureHash } from '../utils/passwordHelper';
import { generateToken, generateUniqueId } from '../utils/generator';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { RechargeHistory } from '../models/RechargeHistory';
import { RechargeType } from '../constants/user';

// Admin login
export const adminLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return next(new AppError('Email and password are required', 400));
        }

        // Find admin user by email
        const admin = await User.findOne({
            email,
            role: { $in: ['admin', 'superAdmin'] },
            isDeleted: false
        }).select('+password');
        if (!admin) {
            return next(new AppError('Invalid credentials', 401));
        }

        // Check if admin is blocked
        if (admin.isBlocked) {
            return next(new AppError('Account is blocked. Contact super admin.', 403));
        }

        // Verify password
        const isPasswordValid = await verifySecureHash(password, admin.password!);
        if (!isPasswordValid) {
            return next(new AppError('Invalid credentials', 401));
        }

        // Generate tokens
        const accessToken = generateToken(admin.userId.toString(), 'access');
        const refreshToken = generateToken(admin.userId.toString(), 'refresh');
        // Update refresh token in database
        admin.refreshToken = refreshToken;
        await admin.save();

        // Remove sensitive fields
        const adminData = admin.toObject();
        delete adminData.password;
        delete adminData.refreshToken;
        const data = {
            user: adminData,
            token: accessToken,
            refreshToken,
        };

        return sendResponse(res, 200, true, 'Admin login successful', data);
    } catch (error) {
        await Logger('adminLogin', error);
        next(new AppError('Error during admin login', 500));
    }
};


// Admin logout
export const adminLogout = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const adminId = (req as any).user._id;

        // Clear refresh token
        await User.findByIdAndUpdate(adminId, {
            refreshToken: '',
        });

        return sendResponse(res, 200, true, 'Admin logout successful');
    } catch (error) {
        await Logger('adminLogout', error);
        next(new AppError('Error during admin logout', 500));
    }
};

// Get admin profile
export const getAdminProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const adminId = (req as any).user.userId;
        const admin = await User.findOne({ userId: adminId }).select('-password -refreshToken');
        if (!admin) {
            return next(new AppError('Admin not found', 404));
        }

        return sendResponse(res, 200, true, 'Admin profile fetched successfully', admin);
    } catch (error) {
        await Logger('getAdminProfile', error);
        next(new AppError('Error fetching admin profile', 500));
    }
};

// Update admin profile
export const updateAdminProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const adminId = (req as any).user._id;
        const { name, password } = req.body;

        const updates: any = { name };

        // If password is provided, hash it and add to updates
        if (password) {
            updates.password = await generateSecureHash(password);
        }

        const admin = await User.findByIdAndUpdate(
            adminId,
            updates,
            { new: true }
        ).select('-password -refreshToken');

        if (!admin) {
            return next(new AppError('Admin not found', 404));
        }

        return sendResponse(res, 200, true, 'Admin profile updated successfully', admin);
    } catch (error) {
        await Logger('updateAdminProfile', error);
        next(new AppError('Error updating admin profile', 500));
    }
};

// admin add coin in user account
export const addCoinsToUser = async (req: AuthRequest, res: Response) => {
    try {
        const { userId, coins } = req.body;
        const { role } = req.user || {};

        if (role !== "superAdmin" && role !== "admin") {
            return sendResponse(res, 403, false, "Access Denied");
        }

        if (!userId || !coins) {
            return sendResponse(res, 400, false, "UserId and coins are required");
        }

        const coinsToAdd = Number(coins);
        if (isNaN(coinsToAdd) || coinsToAdd <= 0) {
            return sendResponse(res, 400, false, "Invalid coins amount");
        }

        const user = await User.findOne({ userId });

        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        // Update user coins
        user.coins = (user.coins || 0) + coinsToAdd;
        await user.save();

        // Create recharge history
        await RechargeHistory.create({
            userId: user.userId,
            type: RechargeType.OFFLINE,
            coins: coinsToAdd,
            date: new Date(),
            sellerId: req.user?.userId
        });

        return sendResponse(res, 200, true, "Coins added successfully", {
            currentCoins: user.coins
        });

    } catch (error: any) {
        await Logger("addCoinsToUser", error);
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ SuperAdmin: Manage Admins ============

// Create Admin (Agency)
export const createAgencyAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (role !== "superAdmin") return sendResponse(res, 403, false, "Access Denied");

        const { name, email, password, meethiId, phoneNumber } = req.body;

        if (!name || !email || !password || !meethiId) {
            return sendResponse(res, 400, false, "Name, Email, Password, and Meethi ID are required");
        }

        // Check uniqueness
        const existing = await User.findOne({
            $or: [{ email }, { meethiId }, { phoneNumber }]
        });

        if (existing) {
            return sendResponse(res, 400, false, "Admin with this Email, Phone or Meethi ID already exists");
        }

        const hashedPassword = await generateSecureHash(password);
        const userId = await generateUniqueId();

        const newAdmin = await User.create({
            name,
            email,
            password: hashedPassword,
            phoneNumber,
            role: 'admin',
            userId,
            meethiId,
            gender: 'other', // Default
            emailVerified: true,
            isActive: true,
            device: {
                createdDeviceId: "ADMIN_PANEL",
                currentDeviceId: "ADMIN_PANEL"
            }
        });

        const adminData = newAdmin.toObject();
        delete adminData.password;

        return sendResponse(res, 201, true, "sub-Admin created successfully", adminData);
    } catch (error: any) {
        await Logger("createAgencyAdmin", error);
        return sendResponse(res, 500, false, error.message);
    }
}

// Get All Admins
export const getAllAdmins = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (role !== "superAdmin") return sendResponse(res, 403, false, "Access Denied");

        const admins = await User.find({ role: 'admin', isDeleted: false })
            .select('-password -refreshToken')
            .sort({ createdAt: -1 });

        return sendResponse(res, 200, true, "Admins fetched", admins);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}

// Block/Unblock Admin
export const toggleBlockAdmin = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (role !== "superAdmin") return sendResponse(res, 403, false, "Access Denied");

        const { id } = req.params;
        const admin = await User.findById(id);

        if (!admin || admin.role !== 'admin') {
            return sendResponse(res, 404, false, "Admin not found");
        }

        admin.isBlocked = !admin.isBlocked; // Toggle
        await admin.save();

        return sendResponse(res, 200, true, `Admin ${admin.isBlocked ? 'Blocked' : 'Unblocked'} successfully`);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
}
