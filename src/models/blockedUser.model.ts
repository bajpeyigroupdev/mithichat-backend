import mongoose, { Schema, Document } from "mongoose";

interface IBlockedUser extends Document {
  userId: string;
  blockedBy: string;
  reason?: string;
  createdAt: Date;
}

const BlockedUserSchema = new Schema<IBlockedUser>({
  userId: { type: String, required: true, unique: true },
  blockedBy: { type: String, required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const BlockedUser = mongoose.model<IBlockedUser>("BlockedUser", BlockedUserSchema);
