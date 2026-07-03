import mongoose, { Document, Schema, Model } from "mongoose";

// Conversation interface
export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Schema
const conversationSchema = new Schema<IConversation>(
  {
    participants: [
      { type: Schema.Types.ObjectId, ref: "User", required: true },
    ],
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true }
);

// Indexes for performance
conversationSchema.index({ participants: 1 }); // Find conversations by user
conversationSchema.index({ updatedAt: -1 }); // Sort by recent activity

// Model
const Conversation: Model<IConversation> = mongoose.model<IConversation>(
  "Conversation",
  conversationSchema
);

export default Conversation;
