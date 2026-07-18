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
            role: { $in: ['owner', 'operator', 'superAdmin', 'admin', 'agency', 'coinSeller'] },
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
            return sendResponse(res, 400, false, "Coins and UserId are required");
        }

        const amountToAdd = Number(coins);
        if (isNaN(amountToAdd) || amountToAdd <= 0) {
            return sendResponse(res, 400, false, "Invalid coins amount");
        }

        const user = await User.findOne({ userId });

        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        user.coins = (user.coins || 0) + amountToAdd;
        await user.save();

        // Create recharge history
        await RechargeHistory.create({
            userId: user.userId,
            type: RechargeType.OFFLINE,
            coins: amountToAdd,
            diamonds: 0,
            date: new Date(),
            sellerId: req.user?.userId
        });

        return sendResponse(res, 200, true, "Coins added successfully", {
            currentCoins: user.coins,
            currentDiamonds: user.diamonds
        });

    } catch (error: any) {
        await Logger("addCoinsToUser", error);
        return sendResponse(res, 500, false, error.message);
    }
};

// admin add diamonds in user account
export const addDiamondsToUser = async (req: AuthRequest, res: Response) => {
    try {
        const { userId, diamonds } = req.body;
        const { role } = req.user || {};

        if (role !== "superAdmin" && role !== "admin") {
            return sendResponse(res, 403, false, "Access Denied");
        }

        if (!userId || !diamonds) {
            return sendResponse(res, 400, false, "Diamonds and UserId are required");
        }

        const amountToAdd = Number(diamonds);
        if (isNaN(amountToAdd) || amountToAdd <= 0) {
            return sendResponse(res, 400, false, "Invalid diamonds amount");
        }

        const user = await User.findOne({ userId });

        if (!user) {
            return sendResponse(res, 404, false, "User not found");
        }

        user.diamonds = (user.diamonds || 0) + amountToAdd;
        await user.save();

        // Create recharge history
        await RechargeHistory.create({
            userId: user.userId,
            type: RechargeType.OFFLINE,
            coins: 0,
            diamonds: amountToAdd,
            date: new Date(),
            sellerId: req.user?.userId
        });

        return sendResponse(res, 200, true, "Diamonds added successfully", {
            currentCoins: user.coins,
            currentDiamonds: user.diamonds
        });

    } catch (error: any) {
        await Logger("addDiamondsToUser", error);
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ Role Hierarchy: Employee Code Generator ============

const generateEmployeeCode = (prefix: string, userId: number): string => {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${userId}${random}`;
};

// ============ Role Hierarchy: Who Can Create Whom ============
// owner          -> operator, superAdmin, admin, agency, coinSeller
// operator       -> superAdmin, admin, agency, coinSeller
// superAdmin     -> admin, agency, coinSeller
// admin          -> agency, coinSeller
// agency         -> (cannot create other staff)
const canCreate: Record<string, string[]> = {
    owner:      ['operator', 'superAdmin', 'admin', 'agency', 'coinSeller', 'host'],
    operator:   ['superAdmin', 'admin', 'agency', 'coinSeller', 'host'],
    superAdmin: ['admin', 'agency', 'coinSeller', 'host'],
    admin:      ['agency', 'coinSeller', 'host'],
    agency:     ['host'],
};

const roleCodePrefix: Record<string, string> = {
    operator:   'OPR',
    superAdmin: 'SA',
    admin:      'ADM',
    agency:     'AGN',
    coinSeller: 'CS',
    host:       'HST',
};

// ============ Create any sub-role employee ============
export const createEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const { role: creatorRole, userId: creatorUserId, id: creatorId } = req.user || {};

        const { name, email, password, phoneNumber, targetRole, documents } = req.body;

        if (!creatorRole || !canCreate[creatorRole]) {
            return sendResponse(res, 403, false, 'Access Denied: You do not have permission to create employees.');
        }

        const allowedRoles = canCreate[creatorRole];
        if (!allowedRoles.includes(targetRole)) {
            return sendResponse(res, 403, false, `Access Denied: A "${creatorRole}" cannot create a "${targetRole}".`);
        }

        if (!name || !email || !password) {
            return sendResponse(res, 400, false, 'Name, Email, and Password are required.');
        }

        // Documents required for all non-owner roles
        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return sendResponse(res, 400, false, 'At least one document URL is required.');
        }

        const existing = await User.findOne({ $or: [{ email }, phoneNumber ? { phoneNumber } : {}] });
        if (existing) {
            return sendResponse(res, 400, false, 'User with this Email or Phone already exists.');
        }

        const hashedPassword = await generateSecureHash(password);
        const newUserId = await generateUniqueId();
        const employeeCode = generateEmployeeCode(roleCodePrefix[targetRole] || 'EMP', newUserId);

        const newEmployee = await User.create({
            name,
            email,
            password: hashedPassword,
            phoneNumber: phoneNumber || undefined,
            role: targetRole,
            userId: newUserId,
            gender: 'other',
            emailVerified: true,
            isActive: true,
            employeeCode,
            referredBy: creatorId,
            documents: documents || [],
            device: {
                createdDeviceId: 'ADMIN_PANEL',
                currentDeviceId: 'ADMIN_PANEL'
            }
        });

        const empData = newEmployee.toObject();
        delete empData.password;

        return sendResponse(res, 201, true, `${targetRole} created successfully`, {
            ...empData,
            employeeCode,
        });
    } catch (error: any) {
        await Logger('createEmployee', error);
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ List sub-employees (with data isolation) ============
export const listEmployees = async (req: AuthRequest, res: Response) => {
    try {
        const { role, id: myId } = req.user || {};
        const { targetRole } = req.query;

        if (!role || !canCreate[role]) {
            return sendResponse(res, 403, false, 'Access Denied');
        }

        const allowedRoles = canCreate[role];

        // owners/operators/superAdmins see ALL
        // admins and agencies only see their own sub-employees
        const roleFilter = targetRole && allowedRoles.includes(targetRole as string)
            ? [targetRole as string]
            : allowedRoles;

        const query: any = { role: { $in: roleFilter }, isDeleted: false };
        if (role === 'admin' || role === 'agency') {
            query.referredBy = myId;
        }

        const employees = await User.find(query)
            .select('-password -refreshToken')
            .sort({ createdAt: -1 });

        return sendResponse(res, 200, true, 'Employees fetched', employees);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ Block/Unblock sub-employee ============
export const toggleBlockEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const { role, id: myId } = req.user || {};

        if (!role || !canCreate[role]) {
            return sendResponse(res, 403, false, 'Access Denied');
        }

        const { id } = req.params;
        const employee = await User.findById(id);

        if (!employee || employee.isDeleted) {
            return sendResponse(res, 404, false, 'Employee not found');
        }

        // Admins can only block their own subordinates
        if ((role === 'admin' || role === 'agency') && String(employee.referredBy) !== String(myId)) {
            return sendResponse(res, 403, false, 'Access Denied: Not your subordinate');
        }

        employee.isBlocked = !employee.isBlocked;
        await employee.save();

        return sendResponse(res, 200, true, `Employee ${employee.isBlocked ? 'blocked' : 'unblocked'} successfully`);
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ Owner Override: Linkage ============
export const overrideEmployeeLinkage = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (role !== 'owner') {
            return sendResponse(res, 403, false, 'Access Denied: Only owners can override linkages');
        }

        const { id } = req.params;
        const { referredBy, employeeCode } = req.body;

        const employee = await User.findById(id);
        if (!employee) {
            return sendResponse(res, 404, false, 'Employee not found');
        }

        if (referredBy !== undefined) {
            // Check if referring user exists
            if (referredBy) {
                const referringUser = await User.findById(referredBy);
                if (!referringUser) {
                    return sendResponse(res, 404, false, 'Referring user not found');
                }
            }
            employee.referredBy = referredBy || undefined;
        }
        
        if (employeeCode !== undefined) {
            if (employeeCode) {
                const existingCode = await User.findOne({ employeeCode, _id: { $ne: employee._id } });
                if (existingCode) {
                    return sendResponse(res, 400, false, 'Employee code already in use by another user');
                }
            }
            employee.employeeCode = employeeCode;
        }

        await employee.save();
        return sendResponse(res, 200, true, 'Employee linkage updated successfully');
    } catch (error: any) {
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ Legacy: Keep createAgencyAdmin for backward compat ============
export const createAgencyAdmin = createEmployee;
export const getAllAdmins = listEmployees;
export const toggleBlockAdmin = toggleBlockEmployee;
