import {
  validateMessageContent,
  ModerationResult,
  ModerationCategory,
} from "../services/messageModerationService";

export type ViolationType =
  | ModerationCategory
  | "PHONE_NUMBER"
  | "SOCIAL_HANDLE"
  | "LINK_URL"
  | "NUMBER_WORDS"
  | "MESSAGING_APP"
  | "CONTACT_SHARING";

export interface ViolationResult {
  isViolated: boolean;
  type?: ViolationType;
  reason?: string;
  matchedPattern?: string;
  normalizedContent?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
}

export { validateMessageContent, containsContactInformation } from "../services/messageModerationService";

/**
 * Backward-compatible Chat Moderation Wrapper
 */
export function detectChatViolation(content: string): ViolationResult {
  const result: ModerationResult = validateMessageContent(content);

  if (!result.allowed) {
    return {
      isViolated: true,
      type: result.category || "CONTACT_SHARING",
      reason: result.reason,
      matchedPattern: result.matchedPattern,
      normalizedContent: result.normalizedContent,
      severity: "HIGH",
    };
  }

  return { isViolated: false };
}
