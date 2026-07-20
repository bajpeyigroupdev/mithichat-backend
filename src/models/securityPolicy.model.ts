import mongoose, { Schema, Document } from 'mongoose';

export interface ISecurityPolicy extends Document {
    require2FA: boolean;
    ipAllowlist: string[];
    maxFailedLoginAttempts: number;
    sessionTimeoutMinutes: number;
    passwordMinLength: number;
    updatedBy?: mongoose.Types.ObjectId;
    updatedAt: Date;
}

const SecurityPolicySchema = new Schema<ISecurityPolicy>({
    require2FA: { type: Boolean, default: false },
    ipAllowlist: [{ type: String }],
    maxFailedLoginAttempts: { type: Number, default: 5 },
    sessionTimeoutMinutes: { type: Number, default: 480 },
    passwordMinLength: { type: Number, default: 8 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const SecurityPolicy = mongoose.model<ISecurityPolicy>('SecurityPolicy', SecurityPolicySchema);
