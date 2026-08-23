export const MODERATION_ESCALATION = {
  warning: {
    violations: Number(process.env.MODERATION_WARN_THRESH) || 1,
  },
  temporaryMute: {
    violations: Number(process.env.MODERATION_TEMP_MUTE_THRESH) || 3,
    windowHours: Number(process.env.MODERATION_TEMP_MUTE_WINDOW_HRS) || 24,
    muteMinutes: Number(process.env.MODERATION_TEMP_MUTE_MINS) || 30,
  },
  extendedMute: {
    violations: Number(process.env.MODERATION_EXT_MUTE_THRESH) || 5,
    windowHours: Number(process.env.MODERATION_EXT_MUTE_WINDOW_HRS) || 24,
    muteHours: Number(process.env.MODERATION_EXT_MUTE_HRS) || 24,
  },
  accountReview: {
    violations: Number(process.env.MODERATION_REVIEW_THRESH) || 8,
    windowDays: Number(process.env.MODERATION_REVIEW_WINDOW_DAYS) || 7,
  },
};
