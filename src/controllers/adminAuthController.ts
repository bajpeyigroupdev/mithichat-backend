import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { Request as RequestModel } from '../models/request.model';
import sendResponse from '../utils/reponse';
import AppError from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { verifySecureHash, generateSecureHash } from '../utils/passwordHelper';
import { generateToken, generateUniqueId } from '../utils/generator';
import { AuthRequest } from '../middlewares/authorize.middleware';
import { RechargeHistory } from '../models/RechargeHistory';
import { RechargeType } from '../constants/user';
import { HierarchyScopeService } from '../utils/hierarchyScope';
import { getAccountRoleScope, PANEL_ACCOUNT_ROLES } from '../utils/accountScope';

// Admin login — Email + Password only. No username, no mobile.
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

        const inputIdentifier = email.toLowerCase().trim();

        // Find user by email, username, meethiId, employeeCode, or specialCode
        let admin = await User.findOne({
            $or: [
                { email: inputIdentifier },
                { userName: inputIdentifier },
                { meethiId: inputIdentifier.toUpperCase() },
                { employeeCode: inputIdentifier.toUpperCase() },
                { specialCode: inputIdentifier.toUpperCase() }
            ],
            role: { $in: PANEL_ACCOUNT_ROLES },
            isDeleted: false
        }).select('+password +mustChangePassword +refreshToken');

        // Fallback: Check RequestModel for pending candidates and auto-activate user
        if (!admin) {
            const pendingReq = await RequestModel.findOne({
                $or: [
                    { 'data.email': inputIdentifier },
                    { 'data.officialEmail': inputIdentifier },
                    { 'data.emailId': inputIdentifier },
                    { 'data.meethiChatId': inputIdentifier.toUpperCase() }
                ]
            });

            if (pendingReq) {
                try {
                    const { finalizeUserApproval } = await import('./emsController');
                    const mongoose = await import('mongoose');
                    const mockOwnerId = new mongoose.Types.ObjectId().toString();
                    await finalizeUserApproval(pendingReq, { id: mockOwnerId, role: 'owner' });

                    admin = (await User.findOne({
                        $or: [
                            { email: inputIdentifier },
                            { emsRequestId: (pendingReq as any)._id }
                        ],
                        role: { $in: PANEL_ACCOUNT_ROLES },
                    }).select('+password +mustChangePassword +refreshToken')) as any;
                } catch (autoErr) {
                    console.error('[AdminAuth] Auto-activation of pending request failed:', autoErr);
                }
            }
        }

        const { LoginHistory } = await import('../models/loginHistory.model');
        const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || '';

        if (!admin) {
            await LoginHistory.create({
                email: inputIdentifier,
                role: 'unknown',
                ipAddress: clientIp,
                userAgent,
                loginStatus: 'Failed_Invalid_Credentials',
                failureReason: 'User not found in system'
            });
            return next(new AppError('Invalid credentials', 401));
        }

        // Block hosts from admin panel (they use mobile app only)
        if ((admin.role as string) === 'host') {
            await LoginHistory.create({
                userId: admin._id,
                email: email.toLowerCase().trim(),
                role: admin.role,
                ipAddress: clientIp,
                userAgent,
                loginStatus: 'Failed_Host_Blocked',
                failureReason: 'Host role must use mobile application'
            });
            return next(new AppError('This account is only allowed to login through the Mobile Application.', 403));
        }

        // Check if admin is blocked
        if (admin.isBlocked) {
            await LoginHistory.create({
                userId: admin._id,
                email: email.toLowerCase().trim(),
                role: admin.role,
                ipAddress: clientIp,
                userAgent,
                loginStatus: 'Failed_Blocked',
                failureReason: 'Account suspended/blocked'
            });
            return next(new AppError('Account is suspended. Contact your administrator.', 403));
        }

        // Verify password
        const isPasswordValid = await verifySecureHash(password, admin.password!);
        if (!isPasswordValid) {
            await LoginHistory.create({
                userId: admin._id,
                email: email.toLowerCase().trim(),
                role: admin.role,
                ipAddress: clientIp,
                userAgent,
                loginStatus: 'Failed_Invalid_Credentials',
                failureReason: 'Incorrect password'
            });
            return next(new AppError('Invalid credentials', 401));
        }

        // Log Successful Login
        await LoginHistory.create({
            userId: admin._id,
            email: email.toLowerCase().trim(),
            role: admin.role,
            ipAddress: clientIp,
            userAgent,
            loginStatus: 'Success',
            failureReason: ''
        });

        // Generate tokens
        const accessToken = generateToken(admin.userId.toString(), 'access');
        const refreshToken = generateToken(admin.userId.toString(), 'refresh');

        // Update refresh token + last login timestamp
        admin.refreshToken = refreshToken;
        (admin as any).lastLogin = new Date();
        await admin.save();

        // Remove sensitive fields
        const adminData = admin.toObject();
        delete adminData.password;
        delete adminData.refreshToken;

        const data = {
            user: adminData,
            token: accessToken,
            refreshToken,
            mustChangePassword: (admin as any).mustChangePassword === true,
        };

        return sendResponse(res, 200, true, 'Login successful', data);
    } catch (error) {
        await Logger('adminLogin', error);
        next(new AppError('Error during login', 500));
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

        return sendResponse(res, 200, true, 'Logout successful');
    } catch (error) {
        await Logger('adminLogout', error);
        next(new AppError('Error during logout', 500));
    }
};

// Change password (used for first-login forced change and voluntary changes)
export const changePassword = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const adminId = (req as any).user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return next(new AppError('Current password and new password are required', 400));
        }

        // Password complexity validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{10,20}$/;
        if (!passwordRegex.test(newPassword)) {
            return next(new AppError(
                'New password must be 10-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)',
                400
            ));
        }

        const user = await User.findById(adminId).select('+password +mustChangePassword');
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        // Verify current password
        const isValid = await verifySecureHash(currentPassword, user.password!);
        if (!isValid) {
            return next(new AppError('Current password is incorrect', 401));
        }

        // Prevent reusing the same password
        const isSamePassword = await verifySecureHash(newPassword, user.password!);
        if (isSamePassword) {
            return next(new AppError('New password cannot be the same as your current password', 400));
        }

        // Hash and save new password
        const hashedNewPassword = await generateSecureHash(newPassword);
        user.password = hashedNewPassword;
        (user as any).mustChangePassword = false;
        await user.save();

        return sendResponse(res, 200, true, 'Password changed successfully. Please login with your new password.');
    } catch (error) {
        await Logger('changePassword', error);
        next(new AppError('Error changing password', 500));
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

        if (!['owner', 'superAdmin', 'admin'].includes(role || '')) {
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

        if (!['owner', 'superAdmin', 'admin'].includes(role || '')) {
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

// Verify user by ID/Username for Recharge
export const verifyUserForRecharge = async (req: AuthRequest, res: Response) => {
    try {
        const { identifier } = req.params;
        if (!identifier) {
            return sendResponse(res, 400, false, "User ID or Username is required");
        }

        const trimmed = String(identifier).trim();
        const numId = Number(trimmed);

        const query: any = { isDeleted: false };
        if (!isNaN(numId) && numId > 0) {
            query.$or = [
                { userId: numId },
                { meethiId: trimmed },
                { userName: trimmed },
                { userName: trimmed.replace(/^@/, '') }
            ];
        } else {
            query.$or = [
                { meethiId: trimmed },
                { userName: trimmed },
                { userName: trimmed.replace(/^@/, '') }
            ];
        }

        const user = await User.findOne(query).select("userId name userName meethiId image coins diamonds role isBlocked");

        if (!user) {
            return sendResponse(res, 404, false, "User not found with this ID or Username");
        }

        return sendResponse(res, 200, true, "User verified successfully", {
            user: {
                userId: user.userId,
                name: user.name || "N/A",
                userName: user.userName ? (user.userName.startsWith('@') ? user.userName : `@${user.userName}`) : `@user${user.userId}`,
                meethiId: user.meethiId || String(user.userId),
                image: user.image || "",
                coins: user.coins || 0,
                diamonds: user.diamonds || 0,
                role: user.role,
                isBlocked: user.isBlocked
            }
        });
    } catch (error: any) {
        await Logger("verifyUserForRecharge", error);
        return sendResponse(res, 500, false, error.message || "Failed to verify user");
    }
};


// ============ Role Hierarchy: Employee Code Generator ============

const generateEmployeeCode = (prefix: string, userId: number): string => {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${userId}${random}`;
};

// ============ Role Hierarchy: Who Can Create Whom ============
// owner          -> operator, superAdmin, admin, agency, coinSeller, host, user
// operator       -> superAdmin, admin, agency, coinSeller, host, user
// superAdmin     -> admin, agency, coinSeller, host, user
// admin          -> agency, coinSeller, host, user
// agency         -> host, user
const canCreate: Record<string, string[]> = {
    owner:      ['operator', 'superAdmin', 'admin', 'agency', 'coinSeller', 'customerSupport', 'host', 'user'],
    operator:   ['superAdmin', 'admin', 'agency', 'coinSeller', 'customerSupport', 'host', 'user'],
    superAdmin: ['admin', 'agency', 'coinSeller', 'customerSupport', 'host'],
    admin:      ['agency', 'coinSeller', 'customerSupport', 'host'],
    agency:     ['host'],
};

const roleCodePrefix: Record<string, string> = {
    operator:   'OPR',
    superAdmin: 'SA',
    admin:      'ADM',
    agency:     'AGN',
    coinSeller: 'CS',
    customerSupport: 'SUP',
    host:       'HST',
    user:       'USR',
};

// ============ Create any sub-role employee / user ============
export const createEmployee = async (req: AuthRequest, res: Response) => {
    try {
        const { role: creatorRole, userId: creatorUserId, id: creatorId } = req.user || {};

        const { name, email, password, phoneNumber, targetRole, documents } = req.body;
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedPhone = phoneNumber ? String(phoneNumber).trim() : '';

        if (!creatorRole || !canCreate[creatorRole]) {
            return sendResponse(res, 403, false, 'Access Denied: You do not have permission to create accounts.');
        }

        const allowedRoles = canCreate[creatorRole];
        const roleToCreate = targetRole || 'user';
        const accountRoleScope = getAccountRoleScope(roleToCreate);
        if (!allowedRoles.includes(roleToCreate)) {
            return sendResponse(res, 403, false, `Access Denied: A "${creatorRole}" cannot create a "${roleToCreate}".`);
        }

        if (!name || !normalizedEmail || !password) {
            return sendResponse(res, 400, false, 'Name, Email, and Password are required.');
        }

        const docList = Array.isArray(documents) ? documents.filter(Boolean) : (documents ? [documents] : []);

        const existingEmail = await User.findOne({
            email: normalizedEmail,
            role: { $in: accountRoleScope },
        })
            .select('userId role isDeleted status')
            .lean();
        if (existingEmail) {
            const accountState = existingEmail.isDeleted || existingEmail.status === 'Deleted'
                ? 'a deleted account'
                : `an existing ${existingEmail.role || 'user'} account`;
            return sendResponse(
                res,
                409,
                false,
                `This email is already registered to ${accountState} (User ID: ${existingEmail.userId}). Use another email or update the existing account.`
            );
        }

        if (normalizedPhone && accountRoleScope.includes('user')) {
            const existingPhone = await User.findOne({
                phoneNumber: normalizedPhone,
                role: { $in: accountRoleScope },
            })
                .select('userId role isDeleted status')
                .lean();
            if (existingPhone) {
                return sendResponse(
                    res,
                    409,
                    false,
                    `This phone number is already registered (User ID: ${existingPhone.userId}).`
                );
            }
        }

        const hashedPassword = await generateSecureHash(password);
        const newUserId = await generateUniqueId();
        const employeeCode = generateEmployeeCode(roleCodePrefix[roleToCreate] || 'EMP', newUserId);
        const creator = await User.findById(creatorId).lean();
        if (!creator) {
            return sendResponse(res, 401, false, 'Creator account not found');
        }
        const creatorPath = creator.hierarchyPath
            ? `${creator.hierarchyPath}/${creator._id}`
            : String(creator._id);

        const newEmployee = await User.create({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            phoneNumber: normalizedPhone || undefined,
            role: roleToCreate,
            userId: newUserId,
            gender: 'other',
            emailVerified: true,
            isActive: true,
            employeeCode,
            referredBy: creatorId,
            parentId: creatorId,
            parentRole: creatorRole,
            createdBy: creatorId,
            createdByRole: creatorRole,
            ownerId: creator.ownerId || (creatorRole === 'owner' ? creator._id : undefined),
            operatorId: creator.operatorId || (creatorRole === 'operator' ? creator._id : undefined),
            superAdminId: creator.superAdminId || (creatorRole === 'superAdmin' ? creator._id : undefined),
            adminId: creator.adminId || (creatorRole === 'admin' ? creator._id : undefined),
            agencyId: (creator as any).agencyId || (creatorRole === 'agency' ? creator._id : undefined),
            referrerId: String(creator._id),
            referrerRole: creatorRole,
            hierarchyPath: creatorPath,
            documents: docList,
            device: {
                createdDeviceId: 'ADMIN_PANEL',
                currentDeviceId: 'ADMIN_PANEL'
            }
        });

        const empData = newEmployee.toObject();
        delete empData.password;

        return sendResponse(res, 201, true, `${roleToCreate} created successfully`, {
            ...empData,
            employeeCode,
        });
    } catch (error: any) {
        await Logger('createEmployee', error);
        if (error?.code === 11000) {
            const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
            return sendResponse(
                res,
                409,
                false,
                `An account with this ${field} already exists. Search all users, including deleted accounts, or use a different ${field}.`
            );
        }
        return sendResponse(res, 500, false, error.message);
    }
};

// ============ Admin fetch all recharge history logs ============
export const getAdminRechargeHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { role } = req.user || {};
        if (!['owner', 'operator', 'superAdmin', 'admin'].includes(role || '')) {
            return sendResponse(res, 403, false, "Access Denied");
        }

        const { page = 1, limit = 50, type, userId } = req.query;
        const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
        const limitNumber = Math.max(1, parseInt(limit as string, 10) || 50);
        const skip = (pageNumber - 1) * limitNumber;

        const query: any = {};
        if (userId) {
            query.userId = Number(userId);
        }
        if (type) {
            query.type = type;
        }

        const totalRecords = await RechargeHistory.countDocuments(query);
        const records = await RechargeHistory.find(query)
            .sort({ date: -1, createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .lean();

        const userIds = [...new Set(records.map(r => r.userId))];
        const users = await User.find({ userId: { $in: userIds } }).select('userId name email image').lean();
        const userMap = new Map(users.map(u => [u.userId, u]));

        const formattedHistory = records.map(rec => ({
            ...rec,
            user: userMap.get(rec.userId) || { name: `User #${rec.userId}`, email: '' }
        }));

        return sendResponse(res, 200, true, "Recharge history fetched successfully", {
            history: formattedHistory,
            totalRecords,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalRecords / limitNumber)
        });
    } catch (error: any) {
        await Logger("getAdminRechargeHistory", error);
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

        // owners/operators/superAdmins see ALL staff members by default
        // admins and agencies only see their own sub-employees
        const roleFilter = targetRole && allowedRoles.includes(targetRole as string)
            ? [targetRole as string]
            : allowedRoles.filter(r => PANEL_ACCOUNT_ROLES.includes(r as any));


        if (roleFilter.includes('user') && !['owner', 'operator'].includes(role)) {
            return sendResponse(res, 403, false, 'Only owner and operator can view users');
        }
        const hierarchyScope = HierarchyScopeService.buildUserScope({
            id: String(myId),
            role,
        });
        const query: any = {
            $and: [
                hierarchyScope,
                { role: { $in: roleFilter }, isDeleted: false },
            ],
        };

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

        const visibleEmployee = await User.exists({
            $and: [
                HierarchyScopeService.buildUserScope({ id: String(myId), role }),
                { _id: employee._id },
            ],
        });
        if (!visibleEmployee || !canCreate[role].includes(String(employee.role))) {
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
