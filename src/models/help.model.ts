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

// Generate a collision-resistant, user-readable ticket number.
helpRequestSchema.pre('save', function (next) {
    if (!this.ticketNumber) {
        const time = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).slice(2, 7).toUpperCase();
        this.ticketNumber = `TKT-${time}-${random}`;
    }
    next();
});

export default mongoose.model<IHelpRequest>("HelpRequest", helpRequestSchema);
