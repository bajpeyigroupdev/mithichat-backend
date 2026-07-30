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
    channelName?: string;
    appId?: string;
    callerToken?: string;
    callerAgoraUid?: number;
    hostToken?: string;
    hostAgoraUid?: number;
    maxMinutes?: number;
    reservedDiamonds?: number;
    callDeadlineAt?: Date | string;
    billing?: {
      hostLevel: number;
      hostCoinPerMinute: number;
      callDiamondsPerMinute: number;
      platformCommissionRate?: number;
      billedMinutes?: number;
      billingMode?: 'started_minute';
      reportedDurationSec?: number;
    };
    [key: string]: unknown;
  };

}
