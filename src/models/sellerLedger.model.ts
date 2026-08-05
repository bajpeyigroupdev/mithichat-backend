import mongoose, { Schema, Document } from 'mongoose';

export interface ISellerLedger extends Document {
    ledgerId: string;
    sellerId: number;
    sellerObjectId: mongoose.Types.ObjectId;
    transactionType: string;
    openingBalance: number;
    credit: number;
    debit: number;
    closingBalance: number;
    transactionId: string;
    transactionObjectId?: mongoose.Types.ObjectId;
    targetUserId?: number;
    sellerCost: number;
    customerAmount: number;
    profitAmount: number;
    rateSnapshot: {
        userDiamondsPerRupee: number;
        sellerDiscountFactor: number;
        sellerCost: number;
        customerPrice: number;
    };
    createdAt: Date;
}

const SellerLedgerSchema = new Schema<ISellerLedger>(
    {
        ledgerId: { type: String, required: true, unique: true, index: true },
        sellerId: { type: Number, required: true, index: true },
        sellerObjectId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        transactionType: { type: String, required: true },
        openingBalance: { type: Number, required: true },
        credit: { type: Number, default: 0 },
        debit: { type: Number, default: 0 },
        closingBalance: { type: Number, required: true },
        transactionId: { type: String, required: true, index: true },
        transactionObjectId: { type: Schema.Types.ObjectId, ref: 'SellerTransaction' },
        targetUserId: { type: Number },
        sellerCost: { type: Number, default: 0 },
        customerAmount: { type: Number, default: 0 },
        profitAmount: { type: Number, default: 0 },
        rateSnapshot: {
            userDiamondsPerRupee: { type: Number, default: 16.7 },
            sellerDiscountFactor: { type: Number, default: 0.95 },
            sellerCost: { type: Number, default: 95 },
            customerPrice: { type: Number, default: 100 }
        }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

SellerLedgerSchema.index({ sellerId: 1, createdAt: -1 });
SellerLedgerSchema.index({ sellerId: 1, transactionId: 1 });

export const SellerLedger = mongoose.model<ISellerLedger>('SellerLedger', SellerLedgerSchema);
