import mongoose, { Schema, Document } from "mongoose";

export interface IReply {
    sender: 'user' | 'admin';
    message: string;
    createdAt: Date;
}

export interface IHelpRequest extends Document {
    ticketNumber: string;
    userId: Number;
    reason: string;
    message: string;
    image?: string;
    type: 'help' | 'support';
    category: string;
    status: 'pending' | 'resolved' | 'rejected' | 'reopened';
    adminReply?: string;
    replies: IReply[];
    reopenCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const replySchema = new Schema<IReply>(
    {
        sender: { type: String, enum: ['user', 'admin'], required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const helpRequestSchema = new Schema<IHelpRequest>(
    {
        ticketNumber: { type: String, unique: true },
        userId: { type: Number, ref: "User", required: true },
        reason: { type: String, required: true },
        message: { type: String, required: true },
        image: { type: String },
        type: { type: String, enum: ['help', 'support'], default: 'help' },
        category: { type: String, default: 'general' },
        status: { type: String, enum: ['pending', 'resolved', 'rejected', 'reopened'], default: 'pending' },
        adminReply: { type: String },
        replies: { type: [replySchema], default: [] },
        reopenCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Auto-generate ticket number before save
helpRequestSchema.pre('save', async function (next) {
    if (!this.ticketNumber) {
        const count = await mongoose.model('HelpRequest').countDocuments();
        this.ticketNumber = `TKT-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

export default mongoose.model<IHelpRequest>("HelpRequest", helpRequestSchema);
