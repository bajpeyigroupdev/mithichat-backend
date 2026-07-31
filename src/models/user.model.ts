// user.model.ts
import mongoose, { Schema } from "mongoose";
import { UserInterface } from "../interfaces/user.interface";
import { AuthType, Gender, UserRole } from "../constants/user";

const DeviceSchema = new Schema(
  {
    createdDeviceId: { type: String, required: true },
    currentDeviceId: { type: String, default: "" },
    loggedInDeviceIds: { type: [String], default: [] },
  },
  { _id: false }
);

const userSchema = new Schema<UserInterface>(
  {
    userId: { type: Number, required: true, unique: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phoneNumber: { type: String, trim: true },
    gender: {
      type: String,
      enum: Object.values(Gender),
      required: true,
    },
    bio: { type: String, default: "" },
    hobbies: { type: [String], default: [] },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.USER },
    authType: { type: String, enum: Object.values(AuthType), default: AuthType.PHONE },
    coins: { type: Number, default: 0 },
    diamonds: { type: Number, default: 0 },
    image: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    lastOnline: { type: Date },
    device: { type: DeviceSchema, default: () => ({}) },
    googleId: { type: String, default: "" },
    language: { type: [String], default: [] },
    country: {
      name: { type: String, default: '' },
      code: { type: String, default: '' },
      flag: { type: String, default: '' },
    },
    age: { type: Number, default: 18 },
    frameId: { type: String, default: "" },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    refreshToken: { type: String, select: false },
    activeToken: { type: String, default: "" },
    fcmToken: { type: String, default: "" },
    audio: { type: String, default: "" },
    isUserName: { type: Boolean, default: false },
    userName: { type: String, trim: true, unique: true, sparse: true },
    isActive: { type: Boolean, default: false },
    isBusy: { type: Boolean, default: false },
    meethiId: { type: String, default: "" },
    level: { type: Number, default: 3 },
    employeeCode: { type: String, unique: true, sparse: true },
    parentId: { type: Schema.Types.ObjectId, ref: "User" },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    documents: { type: [String], default: [] },
    sourceForm: { type: String, default: "" },
    parentRole: { type: String },
    createdByRole: { type: String },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    operatorId: { type: Schema.Types.ObjectId, ref: "User" },
    superAdminId: { type: Schema.Types.ObjectId, ref: "User" },
    adminId: { type: Schema.Types.ObjectId, ref: "User" },
    agencyId: { type: Schema.Types.ObjectId, ref: "User" },
    specialCode: { type: String, unique: true, sparse: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    branchId: { type: Schema.Types.ObjectId, ref: "BranchRegion" },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    teamId: { type: Schema.Types.ObjectId, ref: "Team" },
    mustChangePassword: { type: Boolean, default: false },
    loginUrl: { type: String, default: '' },
    lastLogin: { type: Date },
    emsRequestId: { type: Schema.Types.ObjectId, ref: 'Request' },
    status: { type: String, enum: ['Active', 'Inactive', 'Blocked', 'Deleted'], default: 'Active' },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deleteReason: { type: String, default: '' },
    referralCode: { type: String, uppercase: true, trim: true },
    referralLink: { type: String, default: '' },
    referrerId: { type: String, default: '' },
    referrerRole: { type: String, default: '' },
    referrerCode: { type: String, uppercase: true, trim: true, default: '' },
    totalReferrals: { type: Number, default: 0 },
    activeReferrals: { type: Number, default: 0 },
    pendingReferrals: { type: Number, default: 0 },
    approvedReferrals: { type: Number, default: 0 },
    rejectedReferrals: { type: Number, default: 0 },
    monthlyReferrals: { type: Number, default: 0 },
    todayReferrals: { type: Number, default: 0 },
    lastReferralAt: { type: Date },
    parentUserId: { type: String, default: '' },
    rootReferralId: { type: String, default: '' },
    hierarchyPath: { type: String, default: '' },
    referralOwnerId: { type: String, default: '', index: true },
    referralOwnerRole: { type: String, default: '' },
    rootOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    rootOperatorId: { type: Schema.Types.ObjectId, ref: 'User' },
    networkId: { type: String, default: '' },
    treeDepth: { type: Number, default: 0 },
    createdFromReferral: { type: Boolean, default: false },
    isRootNode: { type: Boolean, default: false },
    childrenCount: { type: Number, default: 0 },
    activeChildren: { type: Number, default: 0 },
    pendingChildren: { type: Number, default: 0 },
    approvedChildren: { type: Number, default: 0 },
    totalNetworkUsers: { type: Number, default: 0 },
    lastHierarchyUpdate: { type: Date },
    faceVerificationStatus: {
      type: String, enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NOT_SUBMITTED', index: true,
    },
    kycVerificationStatus: {
      type: String, enum: ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'],
      default: 'NOT_SUBMITTED', index: true,
    },
    faceVerifiedAt: { type: Date },
    kycVerifiedAt: { type: Date }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for Global Search Engine, RBAC Filters & Referral Network Engine
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ referralCode: 1 }, { sparse: true });
userSchema.index({ referrerId: 1 }, { sparse: true });
userSchema.index({ referrerCode: 1 }, { sparse: true });
userSchema.index({ hierarchyPath: 1 }, { sparse: true });
userSchema.index({ networkId: 1 }, { sparse: true });
userSchema.index({ superAdminId: 1 }, { sparse: true });
userSchema.index({ adminId: 1 }, { sparse: true });
userSchema.index({ agencyId: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });
userSchema.index(
  { email: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
    name: 'email_role_unique',
  }
);
userSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNumber: { $type: 'string' }, role: 'user' },
    name: 'phone_user_unique',
  }
);
userSchema.index(
  { phoneNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNumber: { $type: 'string' }, role: 'host' },
    name: 'phone_host_unique',
  }
);

export const User = mongoose.model<UserInterface>("User", userSchema);
