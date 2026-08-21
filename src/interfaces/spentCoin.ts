import { Document, Types } from "mongoose";
import { CallStatus, TransactionType } from "../constants/user";


export interface ICoinsTransaction extends Document {
  userId: Types.ObjectId;       // User who spent the coins
  hostId: Types.ObjectId;                              // Host who received the coins
  type: TransactionType;                  // Transaction type
  coinsSpent: number;                      // Coins spent by the user
  hostEarning: number;                     // Coins earned by the host
  createdAt: Date;
  callStart: Date;
  callEnd: Date;
  duration: Number;
  status: CallStatus;        // 👈 new
  lastHeartbeat?: Date;
  ringExpiresAt?: Date;
  channelName: string;       // 👈 new
  // Auto timestamp

  // ✅ Meta object for tokens & UIDs
  meta?: {
    callerToken: string;
    callerAgoraUid: number;
    hostToken: string;
    hostAgoraUid: number;
  };

}
