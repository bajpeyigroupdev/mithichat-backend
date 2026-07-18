// user.interface.ts
import { Document, Types } from "mongoose";
import { AuthType, Gender, UserRole } from "../constants/user";


export interface UserInterface extends Document {
  userId: number;
  name?: string;
  email?: string;
  phoneNumber?: string;
  gender?: Gender;
  fcmToken?: string;
  bio?: string;
  hobbies?: string[];
  emailVerified?: boolean;
  phoneVerified?: boolean;
  password?: string;
  role?: UserRole;
  authType?: AuthType;
  coins?: number;
  diamonds?: number;
  image?: string;
  createdBy?: Types.ObjectId;
  isDeleted?: boolean;
  isOnline?: boolean;
  isBlocked?: boolean;
  lastOnline?: Date;
  device: {
    createdDeviceId?: string;
    currentDeviceId?: string;
    loggedInDeviceIds: string[];
  };
  googleId?: string;
  language?: string[];
  country?: { name?: string; code?: string; flag?: string };
  frameId?: string;
  refreshToken?: string;
  audio?: string;
  isUserName?: boolean;
  userName?: string;
  isActive?: boolean;
  isBusy?: boolean;
  meethiId?: string;
  blockedUsers?: Types.ObjectId[];
  level?: number;
  employeeCode?: string;
  parentId?: Types.ObjectId;
  referredBy?: Types.ObjectId;
  documents?: string[];
  sourceForm?: string;
}
