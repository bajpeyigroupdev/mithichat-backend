import mongoose, { Schema, Document } from "mongoose";

export interface IAppScreen extends Document {
  screenCode: string;           // e.g. "Wallet", "VideoCall", "KycVerification"
  screenName: string;           // e.g. "Wallet & Diamond Purchase"
  screenCategory: string;       // e.g. "Finance", "Calls", "Verification", "User Profile", "Chats"
  description: string;          // Screen description
  allowScreenshot: boolean;     // Can user take screenshots?
  allowScreenRecording: boolean;// Can user record screen?
  flagSecureEnabled: boolean;   // Native Android FLAG_SECURE window protection
  codeSnippet: string;          // Source code / config snippet for view & edit
  filePath?: string;            // Mobile app file path e.g. "src/screens/user/Wallet.js"
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const appScreenSchema = new Schema<IAppScreen>(
  {
    screenCode: { type: String, required: true, unique: true, index: true },
    screenName: { type: String, required: true },
    screenCategory: { type: String, default: "General" },
    description: { type: String, default: "" },
    allowScreenshot: { type: Boolean, default: false },
    allowScreenRecording: { type: Boolean, default: false },
    flagSecureEnabled: { type: Boolean, default: true },
    codeSnippet: { type: String, default: "// React Native Screen Component Code" },
    filePath: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const AppScreen = mongoose.model<IAppScreen>("AppScreen", appScreenSchema);
