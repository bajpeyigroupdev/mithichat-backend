import mongoose, { Schema, Document } from 'mongoose';

export type StockRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ISellerStockRequest extends Document {
    requestId: string;
    sellerId: number;
    sellerObjectId: mongoose.Types.ObjectId;
    sellerCode: string;
    sellerName: string;
    diamonds: number;
    payableAmount: number;
    packageId?: string;
    paymentMethod: string;
    utrNumber: string;
    paymentSlipUrl?: string;
    notes?: string;
    status: StockRequestStatus;
    processedBy?: mongoose.Types.ObjectId;
    processedAt?: Date;
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SellerStockRequestSchema = new Schema<ISellerStockRequest>(
    {
        requestId: { type: String, required: true, unique: true, index: true },
        sellerId: { type: Number, required: true, index: true },
        sellerObjectId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        sellerCode: { type: String, required: true },
        sellerName: { type: String, default: '' },
        diamonds: { type: Number, required: true, min: 1 },
        payableAmount: { type: Number, required: true, min: 0 },
        packageId: { type: String, default: '' },
        paymentMethod: { type: String, default: 'UPI' },
        utrNumber: { type: String, required: true, trim: true },
        paymentSlipUrl: { type: String, default: '' },
        notes: { type: String, default: '' },
        status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING', index: true },
        processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        processedAt: { type: Date },
        rejectionReason: { type: String, default: '' }
    },
    { timestamps: true }
);

SellerStockRequestSchema.index({ status: 1, createdAt: -1 });
SellerStockRequestSchema.index({ sellerId: 1, createdAt: -1 });

export const SellerStockRequest = mongoose.model<ISellerStockRequest>('SellerStockRequest', SellerStockRequestSchema);
