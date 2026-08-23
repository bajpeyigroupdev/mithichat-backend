import mongoose, { Schema, Document, Types } from "mongoose";

export type RiskLevelEnum = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IModerationRiskEvent extends Document {
  userId: Types.ObjectId;
  violationId?: Types.ObjectId;
  previousScore: number;
  newScore: number;
  previousLevel: RiskLevelEnum;
  newLevel: RiskLevelEnum;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const moderationRiskEventSchema = new Schema<IModerationRiskEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    violationId: {
      type: Schema.Types.ObjectId,
      ref: "ChatViolation",
      index: true,
    },
    previousScore: {
      type: Number,
      required: true,
      default: 0,
    },
    newScore: {
      type: Number,
      required: true,
      default: 0,
    },
    previousLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      required: true,
      default: "LOW",
    },
    newLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      required: true,
      default: "LOW",
    },
    reason: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast timeline queries
moderationRiskEventSchema.index({ userId: 1, createdAt: -1 });

export const ModerationRiskEvent = mongoose.model<IModerationRiskEvent>(
  "ModerationRiskEvent",
  moderationRiskEventSchema
);
