import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    adminId: mongoose.Types.ObjectId;
    action: string;
    target: string;
    ipAddress: string;
    details: string;
    userAgent?: string;
    browser?: string;
    device?: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
    createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    ipAddress: { type: String, default: '127.0.0.1' },
    details: { type: String, default: '' },
    userAgent: { type: String },
    browser: { type: String },
    device: { type: String },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    reason: { type: String }
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
