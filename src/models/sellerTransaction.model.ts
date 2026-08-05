import mongoose, { Schema, Document } from 'mongoose';

export type SellerTransactionType = 'STOCK_PURCHASE' | 'USER_RECHARGE' | 'ADMIN_ADJUSTMENT' | 'REFUND' | 'REVERSAL';
export type SellerTransactionStatus = 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface ISellerTransaction extends Document {
    transactionId: string;
    sellerId: number;
    sellerObjectId: mongoose.Types.ObjectId;
    userId?: number;
    userObjectId?: mongoose.Types.ObjectId;
    transactionType: SellerTransactionType;
    diamonds: number;
    sellerCost: number;       // In INR Rupees (e.g. 95)
    customerAmount: number;   // In INR Rupees (e.g. 100)
    profitAmount: number;     // In INR Rupees (e.g. 5)
    balanceBefore: number;
    balanceAfter: number;
    status: SellerTransactionStatus;
    idempotencyKey?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const SellerTransactionSchema = new Schema<ISellerTransaction>(
    {
        transactionId: { type: String, required: true, unique: true, index: true },
        sellerId: { type: Number, required: true, index: true },
        sellerObjectId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        userId: { type: Number, index: true },
        userObjectId: { type: Schema.Types.ObjectId, ref: 'User' },
        transactionType: {
            type: String,
            enum: ['STOCK_PURCHASE', 'USER_RECHARGE', 'ADMIN_ADJUSTMENT', 'REFUND', 'REVERSAL'],
            required: true,
            index: true
        },
        diamonds: { type: Number, required: true, min: 1 },
        sellerCost: { type: Number, required: true, default: 0 },
        customerAmount: { type: Number, required: true, default: 0 },
        profitAmount: { type: Number, required: true, default: 0 },
        balanceBefore: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        status: { type: String, enum: ['SUCCESS', 'FAILED', 'CANCELLED'], default: 'SUCCESS', index: true },
        idempotencyKey: { type: String, unique: true, sparse: true, index: true },
        referenceId: { type: String, default: '' },
        metadata: { type: Schema.Types.Mixed, default: {} }
    },
    { timestamps: true }
);

// Compound indexes for high-speed dashboard, ledger, and history queries
SellerTransactionSchema.index({ sellerId: 1, createdAt: -1 });
SellerTransactionSchema.index({ sellerId: 1, transactionType: 1, createdAt: -1 });
SellerTransactionSchema.index({ userId: 1, createdAt: -1 }, { sparse: true });

export const SellerTransaction = mongoose.model<ISellerTransaction>('SellerTransaction', SellerTransactionSchema);
