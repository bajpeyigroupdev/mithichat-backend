export const MODERATION_RISK_CONFIG = {
  // Risk Score Mapping Thresholds (0 to 100)
  thresholds: {
    LOW: { min: 0, max: 24 },
    MEDIUM: { min: 25, max: 49 },
    HIGH: { min: 50, max: 74 },
    CRITICAL: { min: 75, max: 100 },
  },

  // Base Violation Category Points
  categoryPoints: {
    DIGIT: 5,
    NUMBER_WORD: 6,
    NUMBER_WORDS: 6,
    PHONE_NUMBER: 15,
    ID_SHARING: 12,
    URL: 15,
    LINK_URL: 15,
    DOMAIN: 12,
    EMAIL: 20,
    SOCIAL_CONTACT: 15,
    SOCIAL_HANDLE: 15,
    OBFUSCATED_CONTACT: 25,
    MESSAGING_APP: 15,
    CONTACT_SHARING: 10,
  } as Record<string, number>,

  // Repeat Frequency Bonuses (Non-duplicate, window-based)
  frequencyBonuses: [
    { windowMinutes: 60, minViolations: 2, points: 10 },
    { windowMinutes: 60, minViolations: 3, points: 20 },
    { windowMinutes: 1440, minViolations: 5, points: 25 },
  ],

  // Escalation History Weights
  escalationWeights: {
    WARNING: 0,
    TEMPORARY_CHAT_MUTE: 10,
    EXTENDED_CHAT_MUTE: 20,
    ACCOUNT_REVIEW_REQUIRED: 30,
  } as Record<string, number>,

  // Bypass / Evasion Multiplier for obfuscated attempts
  bypassMultiplier: 1.25,

  // Time Decay Factors (Evaluated dynamically based on last violation timestamp)
  decay: {
    sevenDays: { days: 7, factor: 0.85 },    // 15% reduction
    thirtyDays: { days: 30, factor: 0.50 },  // 50% reduction
    ninetyDays: { days: 90, factor: 0.10 },  // 90% reduction (toward LOW baseline)
  },
};
