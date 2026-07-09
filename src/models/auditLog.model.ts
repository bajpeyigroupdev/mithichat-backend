import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    adminId: mongoose.Types.ObjectId;
    action: string;
    target: string;
    ipAddress: string;
    details: string;
    createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    ipAddress: { type: String, default: '127.0.0.1' },
    details: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
