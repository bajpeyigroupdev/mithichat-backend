
import mongoose, { Schema, Document } from 'mongoose';

export enum KycStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export interface IKyc extends Document {
    userId: number;
    panNumber: string;
    panImage: string;
    aadharNumber: string;
    aadharFrontImage: string;
    aadharBackImage: string;
    status: KycStatus;
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const kycSchema = new Schema<IKyc>(
    {
        userId: { type: Number, required: true, unique: true },
        panNumber: { type: String, required: true },
        panImage: { type: String, required: true },
        aadharNumber: { type: String, required: true },
        aadharFrontImage: { type: String, required: true },
        aadharBackImage: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(KycStatus),
            default: KycStatus.PENDING,
        },
        rejectionReason: { type: String },
    },
    { timestamps: true }
);

export const Kyc = mongoose.model<IKyc>('Kyc', kycSchema);
