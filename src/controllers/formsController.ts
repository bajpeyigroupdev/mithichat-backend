import { User } from "../models/user.model";
import { UserRole } from "../constants/user";
import { generateUniqueId } from "../utils/generator";

const normalizeRole = (role: string) => {
  const value = (role || "").toLowerCase();
  if (value === "coin-seller" || value === "coinseller" || value === "coinSeller") return UserRole.COIN_SELLER;
  if (value === "super-admin" || value === "superadmin" || value === "superAdmin") return UserRole.SUPER_ADMIN;
  if (value === "operator") return UserRole.OPERATOR;
  if (value === "owner") return UserRole.OWNER;
  if (value === "agency") return UserRole.AGENCY;
  if (value === "admin") return UserRole.ADMIN;
  if (value === "host") return UserRole.HOST;
  if (value === "user") return UserRole.USER;
  return UserRole.USER;
};

export const generateEmployeeCode = async (role: string = "employee") => {
  const prefix = (role || "EMP").toUpperCase().slice(0, 3);
  let code = `${prefix}${Date.now().toString().slice(-6)}`;
  while (await User.exists({ employeeCode: code })) {
    code = `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
  }
  return code;
};

export const getAccessibleUserFilter = async (reqUser: any, baseFilter: any = {}) => {
  const safeRole = (reqUser?.role || "user").toLowerCase();
  const baseQuery = { ...(baseFilter || {}), isDeleted: false };

  if (["owner", "operator", "superadmin"].includes(safeRole)) {
    return baseQuery;
  }

  if (["admin", "agency"].includes(safeRole)) {
    const conditions: any[] = [
      { parentId: reqUser?.id },
      { createdBy: reqUser?.id },
      { userId: reqUser?.userId },
    ];

    if (reqUser?.meethiId) {
      conditions.push({ meethiId: reqUser.meethiId });
    }

    return {
      ...baseQuery,
      $or: conditions,
    };
  }

  return {
    ...baseQuery,
    userId: reqUser?.userId,
  };
};

export const createUserFromPublicForm = async (payload: any, formType: string) => {
  const role = normalizeRole(formType === "employee" ? payload.role || "admin" : formType);
  const name = payload.name?.trim();
  const email = payload.email?.trim();
  const phoneNumber = payload.phoneNumber?.trim();

  if (!name || (!email && !phoneNumber)) {
    throw new Error("Name and email/phone are required");
  }

  let seniorUser: any = null;
  if (payload.parentCode) {
    seniorUser = await User.findOne({ employeeCode: payload.parentCode, isDeleted: false }).lean();
  }

  if (!seniorUser && payload.parentId) {
    seniorUser = await User.findOne({ userId: Number(payload.parentId), isDeleted: false }).lean();
  }

  const employeeCode = payload.employeeCode || (await generateEmployeeCode(role));
  const userId = await generateUniqueId();
  const documents = Array.isArray(payload.documents)
    ? payload.documents
    : payload.documents
      ? [payload.documents]
      : [];

  const newUser = await User.create({
    userId,
    name,
    email: email || undefined,
    phoneNumber: phoneNumber || undefined,
    gender: payload.gender || "other",
    role,
    meethiId: payload.meethiId || `${role.toUpperCase()}-${userId}`,
    employeeCode,
    documents,
    parentId: seniorUser?._id,
    createdBy: seniorUser?._id,
    emailVerified: Boolean(email),
    phoneVerified: Boolean(phoneNumber),
    isActive: true,
    device: { createdDeviceId: "PUBLIC_FORM", currentDeviceId: "PUBLIC_FORM" },
  });

  return newUser;
};
