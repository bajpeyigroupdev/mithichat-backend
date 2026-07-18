export enum UserRole {
  OWNER = "owner",
  OPERATOR = "operator",
  SUPER_ADMIN = "superAdmin",
  ADMIN = "admin",
  AGENCY = "agency",
  COIN_SELLER = "coinSeller",
  HOST = "host",
  USER = "user",
}

export const ROLE_HIERARCHY: Record<string, number> = {
  [UserRole.OWNER]: 0,
  [UserRole.OPERATOR]: 1,
  [UserRole.SUPER_ADMIN]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.AGENCY]: 4,
  [UserRole.COIN_SELLER]: 5,
  [UserRole.HOST]: 6,
  [UserRole.USER]: 7,
};

export enum AuthType {
  GOOGLE = "google",
  PHONE = "phone",
}

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
}

export enum RechargeType {
  ONLINE = 'online',
  OFFLINE = 'offline',
  GOOGLE_PLAY = 'google_play',
}


export enum TransactionType {
  VOICE_CALL = 'voice_call',
  GIFT = 'gift',
  GIFT_SENT = 'gift_sent',
}

export enum CallStatus {
  INITIATED = 'initiated',
  RINGING = 'ringing',
  ACCEPTED = 'accepted',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
  MISSED = 'missed',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}
