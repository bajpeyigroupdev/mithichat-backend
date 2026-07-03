import mongoose, { Schema, Document } from "mongoose";

export interface ILiveHistory extends Document {
    userId: mongoose.Types.ObjectId;
    startTime: Date;
    endTime?: Date;
    duration?: number; // in seconds
    status: 'active' | 'completed';
    createdAt: Date;
    updatedAt: Date;
}

const liveHistorySchema = new Schema<ILiveHistory>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        startTime: { type: Date, required: true, default: Date.now },
        endTime: { type: Date },
        duration: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['active', 'completed'],
            default: 'active',
        },
    },
    { timestamps: true }
);

export default mongoose.model<ILiveHistory>("LiveHistory", liveHistorySchema);
