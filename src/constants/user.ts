export enum UserRole {
  SUPER_ADMIN = "superAdmin",
  ADMIN = "admin",
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
  PENDING = 'pending',    // user ne call start kiya, host response pending
  ONGOING = 'ongoing',    // host ne accept karke join kar liya
  ENDED = 'ended',        // call ended
  REJECTED = 'rejected',
  MISSED = 'missed'  // host ne reject kar diya
}
