
import mongoose, { Schema, Document } from 'mongoose';

export enum WithdrawalStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export enum WithdrawalMethod {
    BANK = 'bank',
    UPI = 'upi',
}

export interface IWithdrawal extends Document {
    userId: number;
    amount: number; // In INR
    coinsDeducted: number;
    method: WithdrawalMethod;
    details: {
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
        accountHolderName?: string;
        upiId?: string;
    };
    status: WithdrawalStatus;
    rejectionReason?: string;
    transactionId?: string; // Admin can add bank txn id upon approval
    createdAt: Date;
    updatedAt: Date;
}

const withdrawalSchema = new Schema<IWithdrawal>(
    {
        userId: { type: Number, required: true },
        amount: { type: Number, required: true },
        coinsDeducted: { type: Number, required: true },
        method: {
            type: String,
            enum: Object.values(WithdrawalMethod),
            required: true,
        },
        details: {
            bankName: String,
            accountNumber: String,
            ifscCode: String,
            accountHolderName: String,
            upiId: String,
        },
        status: {
            type: String,
            enum: Object.values(WithdrawalStatus),
            default: WithdrawalStatus.PENDING,
        },
        rejectionReason: String,
        transactionId: String,
    },
    { timestamps: true }
);

withdrawalSchema.index({ userId: 1, status: 1 });

export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', withdrawalSchema);
