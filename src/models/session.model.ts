import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
    userId: mongoose.Types.ObjectId;
    token: string;
    refreshToken?: string;
    deviceId: string;
    deviceName?: string;
    ipAddress: string;
    userAgent?: string;
    isActive: boolean;
    lastActiveAt: Date;
    createdAt: Date;
}

const SessionSchema = new Schema<ISession>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    refreshToken: { type: String, default: '' },
    deviceId: { type: String, required: true },
    deviceName: { type: String, default: 'Web Browser / Mobile' },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: { createdAt: true, updatedAt: false } });

SessionSchema.index({ userId: 1, isActive: 1 });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
