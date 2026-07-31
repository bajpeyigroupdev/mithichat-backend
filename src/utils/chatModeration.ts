export type ViolationType =
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

// Map homoglyphs and number word translations
const EN_NUM_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const HI_NUM_WORDS: Record<string, string> = {
  shunya: "0",
  ek: "1",
  do: "2",
  teen: "3",
  chaar: "4",
  char: "4",
  paanch: "5",
  panch: "5",
  chhe: "6",
  che: "6",
  saat: "7",
  sat: "7",
  aath: "8",
  ath: "8",
  nau: "9",
  no: "9",
};

/**
 * Normalization Pipeline
 */
export function normalizeText(text: string): { original: string; normalized: string; digitsOnly: string } {
  if (!text) return { original: "", normalized: "", digitsOnly: "" };

  // Limit max length to avoid expensive CPU work / ReDoS
  const raw = text.slice(0, 2000);

  // Remove zero-width & non-printable characters
  let clean = raw.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F]/g, "").toLowerCase();

  // Normalize Unicode spaces & multi-whitespace
  clean = clean.replace(/\s+/g, " ").trim();

  // Extract digit-like sequences where users space out digits e.g. "9 8 7 6 5 4 3 2 1 0" or "9-8-7-6-5"
  const digitsOnly = clean.replace(/[^0-9]/g, "");

  return { original: raw, normalized: clean, digitsOnly };
}

/**
 * Main Chat Moderation Function
 */
export function detectChatViolation(content: string): ViolationResult {
  if (!content || typeof content !== "string") {
    return { isViolated: false };
  }

  const { normalized, digitsOnly } = normalizeText(content);
  if (!normalized) return { isViolated: false };

  // ---------------------------------------------------------
  // 1. DIRECT OR SEPARATED PHONE NUMBERS (7+ digits sequence)
  // ---------------------------------------------------------
  // 10+ digits anywhere in string regardless of spaces/dots/dashes
  if (digitsOnly.length >= 10) {
    // Check if there is a sequence of 7-15 digits separated by spaces, dots, dashes, parentheses
    const phoneSeqRegex = /(?:\+?\d{1,4}[-.\s\(\)]*)?(?:\(?\d{2,4}\)?[-.\s\(\)]*){2,5}\d{2,4}/g;
    const matches = normalized.match(phoneSeqRegex);
    if (matches) {
      for (const m of matches) {
        const rawDigits = m.replace(/\D/g, "");
        if (rawDigits.length >= 8 && rawDigits.length <= 15) {
          return {
            isViolated: true,
            type: "PHONE_NUMBER",
            reason: `Phone number sequence detected: '${m.trim()}'`,
            matchedPattern: m.trim(),
            normalizedContent: normalized,
            severity: "HIGH",
          };
        }
      }
    }

    // Direct continuous digits >= 10
    if (/\b\d{10,13}\b/.test(normalized.replace(/[\s\.\-]/g, ""))) {
      return {
        isViolated: true,
        type: "PHONE_NUMBER",
        reason: "10+ digit number sequence detected",
        matchedPattern: digitsOnly,
        normalizedContent: normalized,
        severity: "HIGH",
      };
    }
  }

  // ---------------------------------------------------------
  // 2. URL / LINK DETECTION
  // ---------------------------------------------------------
  const urlRegex = /(https?:\/\/|ftp:\/\/|www\.)[^\s/$.?#].[^\s]*/gi;
  if (urlRegex.test(normalized)) {
    const matched = normalized.match(urlRegex)?.[0] || "URL";
    return {
      isViolated: true,
      type: "LINK_URL",
      reason: `External link/URL detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: normalized,
      severity: "HIGH",
    };
  }

  // Explicit TLD domains (e.g. example.com, example.in, t.me/, wa.me/)
  const domainRegex = /\b([a-z0-9-]+\.)+(com|in|net|org|co|app|io|me)\b|t\.me\/|wa\.me\//gi;
  if (domainRegex.test(normalized)) {
    const matched = normalized.match(domainRegex)?.[0] || "Domain";
    return {
      isViolated: true,
      type: "LINK_URL",
      reason: `Domain / Web link detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: normalized,
      severity: "HIGH",
    };
  }

  // ---------------------------------------------------------
  // 3. MESSAGING APPS & CONTACT SHARING KEYWORDS
  // ---------------------------------------------------------
  const messagingRegex = /\b(whatsapp|wa\s*num|wa\s*no|telegram|t\.me|insta|instagram|snapchat|snap|facebook|fb|call\s*me|contact\s*me)\b/i;
  // Check if messaging keyword is combined with digits or contact handles
  if (messagingRegex.test(normalized)) {
    const matched = normalized.match(messagingRegex)?.[0] || "Messaging App";
    // Check if there are also digits or handles nearby
    if (/\d{4,}/.test(normalized) || /@\s*[a-z0-9_.]+/i.test(normalized) || /number|no|num|id|handle/i.test(normalized)) {
      return {
        isViolated: true,
        type: "MESSAGING_APP",
        reason: `External messaging app contact sharing attempt: '${matched}'`,
        matchedPattern: matched,
        normalizedContent: normalized,
        severity: "HIGH",
      };
    }
  }

  // ---------------------------------------------------------
  // 4. SOCIAL HANDLES & @ SYMBOL
  // ---------------------------------------------------------
  // Check @ handle (e.g. @username or @ user_name)
  const handleRegex = /@\s*([a-z0-9_.-]{3,30})/i;
  if (handleRegex.test(normalized)) {
    const matched = normalized.match(handleRegex)?.[0] || "@handle";
    return {
      isViolated: true,
      type: "SOCIAL_HANDLE",
      reason: `Social handle or @ tag detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: normalized,
      severity: "MEDIUM",
    };
  }

  // Email detection
  const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  if (emailRegex.test(normalized)) {
    const matched = normalized.match(emailRegex)?.[0] || "Email";
    return {
      isViolated: true,
      type: "CONTACT_SHARING",
      reason: `Email address detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: normalized,
      severity: "HIGH",
    };
  }

  // ---------------------------------------------------------
  // 5. SPELLED-OUT NUMBERS (English & Hindi) - False Positive Safe
  // ---------------------------------------------------------
  // Tokenize words
  const words = normalized.split(/[\s,.-]+/);
  let convertedSequence = "";
  let wordMatchCount = 0;

  for (const w of words) {
    if (EN_NUM_WORDS[w] !== undefined) {
      convertedSequence += EN_NUM_WORDS[w];
      wordMatchCount++;
    } else if (HI_NUM_WORDS[w] !== undefined) {
      convertedSequence += HI_NUM_WORDS[w];
      wordMatchCount++;
    } else if (/^\d+$/.test(w)) {
      convertedSequence += w;
    }
  }

  // Only trigger NUMBER_WORDS violation if there are at least 3 spelled-out number words or if the sequence total digits >= 8
  if ((wordMatchCount >= 3 && convertedSequence.length >= 5) || (wordMatchCount >= 2 && convertedSequence.length >= 8)) {
    return {
      isViolated: true,
      type: "NUMBER_WORDS",
      reason: `Spelled-out digit sequence detected: '${convertedSequence}'`,
      matchedPattern: convertedSequence,
      normalizedContent: normalized,
      severity: "HIGH",
    };
  }

  // Safe - no violation detected
  return { isViolated: false };
}
