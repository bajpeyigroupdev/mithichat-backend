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
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phoneNumber: { type: String, trim: true, unique: true, sparse: true },
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
    frameId: { type: String, default: "" },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    refreshToken: { type: String, select: false },
    fcmToken: { type: String, default: "" },
    audio: { type: String, default: "" },
    isUserName: { type: Boolean, default: false },
    userName: { type: String, trim: true, unique: true, sparse: true },
    isActive: { type: Boolean, default: false },
    isBusy: { type: Boolean, default: false },
    meethiId: { type: String, default: "" },
    level: { type: Number, default: 6 }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ isDeleted: 1 });
userSchema.index({ createdAt: -1 });

export const User = mongoose.model<UserInterface>("User", userSchema);
