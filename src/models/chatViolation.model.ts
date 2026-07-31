import mongoose, { Schema, Document, Types } from "mongoose";

export type ViolationTypeEnum =
  | "PHONE_NUMBER"
  | "SOCIAL_HANDLE"
  | "LINK_URL"
  | "NUMBER_WORDS"
  | "MESSAGING_APP"
  | "CONTACT_SHARING";

export type SeverityEnum = "LOW" | "MEDIUM" | "HIGH";
export type StatusEnum = "PENDING" | "REVIEWED" | "DISMISSED" | "ACTION_TAKEN";
export type ActionTakenEnum = "NONE" | "DISMISSED" | "USER_BLOCKED";

export interface IChatViolation extends Document {
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  content: string;
  normalizedContent?: string;
  violationType: ViolationTypeEnum;
  reason?: string;
  matchedPattern?: string;
  severity: SeverityEnum;
  status: StatusEnum;
  source: string;
  actionTaken: ActionTakenEnum;
  attemptCount: number;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatViolationSchema = new Schema<IChatViolation>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    normalizedContent: {
      type: String,
    },
    violationType: {
      type: String,
      enum: [
        "PHONE_NUMBER",
        "SOCIAL_HANDLE",
        "LINK_URL",
        "NUMBER_WORDS",
        "MESSAGING_APP",
        "CONTACT_SHARING",
      ],
      required: true,
      index: true,
    },
    reason: {
      type: String,
    },
    matchedPattern: {
      type: String,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "DISMISSED", "ACTION_TAKEN"],
      default: "PENDING",
      index: true,
    },
    source: {
      type: String,
      default: "PRIVATE_CHAT",
    },
    actionTaken: {
      type: String,
      enum: ["NONE", "DISMISSED", "USER_BLOCKED"],
      default: "NONE",
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
chatViolationSchema.index({ createdAt: -1 });

export const ChatViolation = mongoose.model<IChatViolation>(
  "ChatViolation",
  chatViolationSchema
);
