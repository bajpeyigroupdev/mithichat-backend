export enum UserRole {
  OWNER = "owner",
  SUPER_ADMIN = "superAdmin",
  ADMIN = "admin",
  COIN_SELLER = "coinSeller",
  HOST = "host",
  USER = "user",
}

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
