import mongoose, { Schema, Document } from "mongoose";

export interface IHelpRequest extends Document {
    userId: Number;
    reason: string;
    message: string;
    image?: string;
    type: 'help' | 'support';
    category: string;
    status: 'pending' | 'resolved' | 'rejected';
    adminReply?: string;
    createdAt: Date;
    updatedAt: Date;
}

const helpRequestSchema = new Schema<IHelpRequest>(
    {
        userId: { type: Number, ref: "User", required: true },
        reason: { type: String, required: true },
        message: { type: String, required: true },
        image: { type: String },
        type: { type: String, enum: ['help', 'support'], default: 'help' },
        category: { type: String, default: 'general' },
        adminReply: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model<IHelpRequest>("HelpRequest", helpRequestSchema);
