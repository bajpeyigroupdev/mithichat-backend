import mongoose, { Document, Schema } from "mongoose";

export type ActivityEventAudience = "all" | "users" | "hosts" | "verified";
export type ActivityEventStatus = "draft" | "published" | "closed";

export interface IActivityEvent extends Document {
  title: string;
  description: string;
  audience: ActivityEventAudience;
  rewardCoins: number;
  imageUrl?: string;
  actionUrl?: string;
  startAt: Date;
  endAt?: Date;
  status: ActivityEventStatus;
  createdBy: mongoose.Types.ObjectId;
  publishedAt?: Date;
  closedAt?: Date;
  recipientCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const activityEventSchema = new Schema<IActivityEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    audience: {
      type: String,
      enum: ["all", "users", "hosts", "verified"],
      default: "all",
    },
    rewardCoins: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, trim: true },
    actionUrl: { type: String, trim: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "draft",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date },
    closedAt: { type: Date },
    recipientCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

activityEventSchema.index({ status: 1, startAt: -1 });
activityEventSchema.index({ createdAt: -1 });

export const ActivityEvent = mongoose.model<IActivityEvent>(
  "ActivityEvent",
  activityEventSchema
);
