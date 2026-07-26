import mongoose, { Schema, Document } from 'mongoose';

export interface ILoginHistory extends Document {
  userId?: mongoose.Types.ObjectId;
  email: string;
  role: string;
  ipAddress: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  loginStatus: 'Success' | 'Failed_Invalid_Credentials' | 'Failed_Blocked' | 'Failed_Host_Blocked';
  failureReason?: string;
  createdAt: Date;
}

const LoginHistorySchema = new Schema<ILoginHistory>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  role: { type: String, default: 'unknown', index: true },
  ipAddress: { type: String, default: '127.0.0.1' },
  userAgent: { type: String, default: '' },
  browser: { type: String, default: 'Web Browser' },
  os: { type: String, default: 'Windows / Linux / macOS' },
  device: { type: String, default: 'Desktop' },
  loginStatus: { type: String, enum: ['Success', 'Failed_Invalid_Credentials', 'Failed_Blocked', 'Failed_Host_Blocked'], required: true },
  failureReason: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

LoginHistorySchema.index({ userId: 1, createdAt: -1 });
LoginHistorySchema.index({ email: 1, createdAt: -1 });

export const LoginHistory = mongoose.model<ILoginHistory>('LoginHistory', LoginHistorySchema, 'login_history');
