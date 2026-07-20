import mongoose, { Schema, Document } from 'mongoose';

export type PolicyCategory = 'password' | 'approval' | 'leave' | 'compliance' | 'recruitment';

export interface IPolicyRule extends Document {
    policyName: string;
    category: PolicyCategory;
    rules: Record<string, any>;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const PolicyRuleSchema = new Schema<IPolicyRule>({
    policyName: { type: String, required: true, unique: true },
    category: {
        type: String,
        required: true,
        enum: ['password', 'approval', 'leave', 'compliance', 'recruitment'],
        index: true
    },
    rules: { type: Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const PolicyRule = mongoose.model<IPolicyRule>('PolicyRule', PolicyRuleSchema);
