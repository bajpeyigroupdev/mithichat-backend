import mongoose, { Schema, model, Document } from "mongoose";

export interface IHostLevel extends Document {
    level: number;
    name: string;
    minCalls: number;       // Total calls required to reach this level
    minMinutes: number;     // Total call minutes required
    coinPerMinute: number;  // Commission: coins per minute host earns at this level
    expiresAt?: Date;       // Optional expiration date for temporary levels
}

const HostLevelSchema = new Schema<IHostLevel>(
    {
        level: { type: Number, required: true, unique: true },
        name: { type: String, required: true },
        minCalls: { type: Number, default: 0 },
        minMinutes: { type: Number, default: 0 },
        coinPerMinute: { type: Number, default: 1 },
        expiresAt: { type: Date },
    },
    { timestamps: true }
);

const HostLevel = mongoose.models.HostLevel || model<IHostLevel>("HostLevel", HostLevelSchema);
export default HostLevel;
