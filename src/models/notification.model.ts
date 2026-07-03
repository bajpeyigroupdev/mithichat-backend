import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type: 'system' | 'promo' | 'transaction' | 'call';
    isRead: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        type: {
            type: String,
            enum: ['system', 'promo', 'transaction', 'call'],
            default: 'system',
        },
        isRead: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Index for fast retrieval of user's notifications
notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<INotification>("Notification", notificationSchema);
