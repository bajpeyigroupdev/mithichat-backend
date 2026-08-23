import { Types } from "mongoose";
import { ChatViolation, IChatViolation } from "../models/chatViolation.model";
import { User } from "../models/user.model";

export type ModerationCategory =
  | "DIGIT"
  | "NUMBER_WORD"
  | "PHONE_NUMBER"
  | "ID_SHARING"
  | "URL"
  | "DOMAIN"
  | "EMAIL"
  | "SOCIAL_CONTACT"
  | "OBFUSCATED_CONTACT";

export interface ModerationResult {
  allowed: boolean;
  category?: ModerationCategory;
  reason?: string;
  matchedPattern?: string;
  normalizedContent?: string;
}

// Client-safe default error message
export const CLIENT_VIOLATION_MESSAGE =
  "Sharing phone numbers, IDs, links, or contact information is not allowed.";

// English number words
const EN_NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

// Hindi / Hinglish number words
const HI_NUMBER_WORDS = [
  "shunya",
  "zero",
  "ek",
  "do",
  "teen",
  "char",
  "chaar",
  "paanch",
  "panch",
  "che",
  "chhe",
  "saat",
  "aath",
  "nau",
  "das",
];

// Combine all number words for word-sequence lookups
const ALL_NUMBER_WORDS = Array.from(
  new Set([...EN_NUMBER_WORDS, ...HI_NUMBER_WORDS])
);

/**
 * 1. Unicode & Homoglyph Normalization
 * Convert circled digits, full-width digits, keycap emojis to standard 0-9 digits,
 * and strip zero-width/non-printable characters.
 */
export function normalizeUnicodeDigits(text: string): string {
  if (!text) return "";

  let result = text.slice(0, 3000);

  // Remove zero-width & non-printable characters
  result = result.replace(/[\u200B-\u200D\uFEFF\u0000-\u001F]/g, "");

  // Keycap / Emoji digits: 0️⃣ through 9️⃣, 🔟, etc.
  result = result.replace(/0️⃣/g, "0");
  result = result.replace(/1️⃣/g, "1");
  result = result.replace(/2️⃣/g, "2");
  result = result.replace(/3️⃣/g, "3");
  result = result.replace(/4️⃣/g, "4");
  result = result.replace(/5️⃣/g, "5");
  result = result.replace(/6️⃣/g, "6");
  result = result.replace(/7️⃣/g, "7");
  result = result.replace(/8️⃣/g, "8");
  result = result.replace(/9️⃣/g, "9");
  result = result.replace(/🔟/g, "10");

  // Circled digits: ① to ⑨ -> 1 to 9, ⓪ -> 0, ⑩ -> 10
  const circledMap: Record<string, string> = {
    "⓪": "0",
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
    "⑥": "6",
    "⑦": "7",
    "⑧": "8",
    "⑨": "9",
    "⑩": "10",
  };
  result = result.replace(/[①-⑨⓪⑩]/g, (m) => circledMap[m] || m);

  // Full-width digits: ０-９ (U+FF10 to U+FF19)
  result = result.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
  );

  return result;
}

/**
 * 2. De-obfuscation Normalization Pipeline
 * Converts text into multiple normalized views (lowercased, space-collapsed, single-char spaced collapsed).
 */
export function normalizeMessageContent(text: string): {
  original: string;
  cleaned: string;
  deobfuscated: string;
  compact: string;
  digitsOnly: string;
} {
  const normalizedDigits = normalizeUnicodeDigits(text);
  const cleaned = normalizedDigits.toLowerCase().replace(/\s+/g, " ").trim();

  // De-obfuscate single-character spaced tokens:
  // e.g. "n i n e" -> "nine", "o . n . e" -> "one", "m y i d" -> "myid", "w w w . e x a m p l e . c o m" -> "www.example.com"
  let deobfuscated = cleaned;
  let prev = "";
  while (deobfuscated !== prev) {
    prev = deobfuscated;
    deobfuscated = deobfuscated.replace(
      /(^|[^a-z0-9])([a-z0-9])[\s.\-_~*+=/\\|]+(?=[a-z0-9]($|[^a-z0-9]))/gi,
      "$1$2"
    );
  }

  const compact = cleaned.replace(/[^a-z0-9]/g, "");
  const digitsOnly = cleaned.replace(/[^0-9]/g, "");

  return {
    original: text,
    cleaned,
    deobfuscated,
    compact,
    digitsOnly,
  };
}

/**
 * Main Moderation Service Function
 */
export function validateMessageContent(content: string): ModerationResult {
  if (!content || typeof content !== "string" || !content.trim()) {
    return { allowed: true };
  }

  const { original, cleaned, deobfuscated, compact, digitsOnly } =
    normalizeMessageContent(content);

  // =========================================================================
  // 1. STRICT DIGIT & PHONE NUMBER POLICY
  // Any numeric digit (0-9) in any form (continuous, spaced, separated, emoji)
  // =========================================================================
  if (/\d/.test(cleaned) || /\d/.test(deobfuscated) || /\d/.test(compact)) {
    const matchedDigit =
      cleaned.match(/\d+/g)?.join(" ") || digitsOnly || "digit";
    const category: ModerationCategory =
      digitsOnly.length >= 7 ? "PHONE_NUMBER" : "DIGIT";
    return {
      allowed: false,
      category,
      reason: `Message contains numeric digits: '${matchedDigit}'`,
      matchedPattern: matchedDigit,
      normalizedContent: cleaned,
    };
  }

  // =========================================================================
  // 2. EMAIL DETECTION (Standard & Obfuscated) - Placed FIRST before DOMAIN
  // =========================================================================
  // Standard Email
  const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  if (emailRegex.test(cleaned) || emailRegex.test(deobfuscated)) {
    const matched =
      cleaned.match(emailRegex)?.[0] ||
      deobfuscated.match(emailRegex)?.[0] ||
      "Email";
    return {
      allowed: false,
      category: "EMAIL",
      reason: `Email address detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // Obfuscated Email (e.g. "name @ gmail dot com", "name at gmail dot com")
  const obfuscatedEmailRegex =
    /\b[a-z0-9._%+-]+\s*(@|\bat\b|\(at\)|\[at\])\s*[a-z0-9.-]+\s*(dot|\.|\(dot\)|\[dot\])\s*(com|in|net|org|co|io|app)\b/gi;
  if (
    obfuscatedEmailRegex.test(cleaned) ||
    obfuscatedEmailRegex.test(deobfuscated)
  ) {
    const matched =
      cleaned.match(obfuscatedEmailRegex)?.[0] ||
      deobfuscated.match(obfuscatedEmailRegex)?.[0] ||
      "Obfuscated Email";
    return {
      allowed: false,
      category: "EMAIL",
      reason: `Obfuscated email address detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // =========================================================================
  // 3. URL & WEBSITE DOMAIN DETECTION (Including Obfuscated "dot" domains)
  // =========================================================================
  // Explicit URLs (http, https, www, ftp)
  const urlRegex = /(https?:\/\/|ftp:\/\/|www\.)[^\s/$.?#].[^\s]*/gi;
  if (urlRegex.test(cleaned) || urlRegex.test(deobfuscated)) {
    const matched =
      cleaned.match(urlRegex)?.[0] || deobfuscated.match(urlRegex)?.[0] || "URL";
    return {
      allowed: false,
      category: "URL",
      reason: `External URL detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // Common domain TLDs & Short links (e.g. example.com, bit.ly, t.me, wa.me)
  const domainRegex =
    /\b([a-z0-9-]+\.)+(com|in|net|org|co|app|io|xyz|me|info|biz|gov)\b|t\.me\/|wa\.me\/|bit\.ly\//gi;
  if (domainRegex.test(cleaned) || domainRegex.test(deobfuscated)) {
    const matched =
      cleaned.match(domainRegex)?.[0] ||
      deobfuscated.match(domainRegex)?.[0] ||
      "Domain";
    return {
      allowed: false,
      category: "DOMAIN",
      reason: `Domain or short link detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // Obfuscated domains (e.g. "example dot com", "www dot example dot com", "w w w dot example dot com")
  const obfuscatedDomainRegex =
    /\b[a-z0-9_-]+\s+(dot|\.|\(dot\)|\[dot\])\s+(com|in|net|org|co|app|io|xyz|me)\b/gi;
  if (
    obfuscatedDomainRegex.test(cleaned) ||
    obfuscatedDomainRegex.test(deobfuscated)
  ) {
    const matched =
      cleaned.match(obfuscatedDomainRegex)?.[0] ||
      deobfuscated.match(obfuscatedDomainRegex)?.[0] ||
      "Obfuscated Domain";
    return {
      allowed: false,
      category: "DOMAIN",
      reason: `Obfuscated domain detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // =========================================================================
  // 4. NUMBER WORDS DETECTION (English & Hindi / Hinglish + Obfuscated)
  // =========================================================================
  const cleanTokens = cleaned.split(/[\s,.\-_~*+=/\\|]+/);
  const deobfTokens = deobfuscated.split(/[\s,.\-_~*+=/\\|]+/);

  const matchedNumberWords: string[] = [];

  for (const token of [...cleanTokens, ...deobfTokens]) {
    if (token && ALL_NUMBER_WORDS.includes(token)) {
      matchedNumberWords.push(token);
    }
  }

  // Check compact representation if user used separators like n.i.n.e or o-n-e
  if (cleaned !== compact) {
    for (const numWord of ALL_NUMBER_WORDS) {
      if (compact.includes(numWord) && numWord.length >= 3) {
        matchedNumberWords.push(numWord);
      }
    }
  }

  if (matchedNumberWords.length > 0) {
    const matchedStr = matchedNumberWords.join(", ");
    const isObfuscated = deobfuscated !== cleaned || compact !== cleaned;
    return {
      allowed: false,
      category: isObfuscated ? "OBFUSCATED_CONTACT" : "NUMBER_WORD",
      reason: `Number word detected: '${matchedStr}'`,
      matchedPattern: matchedStr,
      normalizedContent: cleaned,
    };
  }

  // Sequence regex for number words
  const numberWordPattern = ALL_NUMBER_WORDS.join("|");
  const numberWordRegex = new RegExp(`\\b(${numberWordPattern})\\b`, "gi");

  if (
    numberWordRegex.test(cleaned) ||
    numberWordRegex.test(deobfuscated)
  ) {
    const matched =
      cleaned.match(numberWordRegex)?.[0] ||
      deobfuscated.match(numberWordRegex)?.[0] ||
      "Number Word";
    return {
      allowed: false,
      category: "NUMBER_WORD",
      reason: `Number word sequence detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // =========================================================================
  // 5. ID & USERNAME SHARING DETECTION (Context-aware & Obfuscated)
  // =========================================================================
  const idPhrasesRegex =
    /\b(my\s*id|mera\s*id|meri\s*id|send\s*id|search\s*my\s*id|add\s*me\s*by\s*id|username\s*is|my\s*username\s*is|user\s*id|whatsapp\s*number|whatsapp\s*id|telegram\s*id|instagram\s*id|insta\s*id|snap\s*id|snapchat\s*id|follow\s*me\s*on|message\s*me\s*on|add\s*me\s*on|find\s*me\s*on|take\s*my\s*id|my\s*insta\s*id)\b/gi;

  if (
    idPhrasesRegex.test(cleaned) ||
    idPhrasesRegex.test(deobfuscated)
  ) {
    const matched =
      cleaned.match(idPhrasesRegex)?.[0] ||
      deobfuscated.match(idPhrasesRegex)?.[0] ||
      "ID Sharing Phrase";
    const isObfuscated = deobfuscated !== cleaned;
    return {
      allowed: false,
      category: isObfuscated ? "OBFUSCATED_CONTACT" : "ID_SHARING",
      reason: `ID/contact sharing attempt detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // Check for obfuscated phrases like "m y i d", "u s e r n a m e", "i n s t a i d"
  const obfuscatedIdTerms = ["myid", "username", "instaid", "sendid", "userid"];
  for (const term of obfuscatedIdTerms) {
    if (
      (deobfuscated.includes(term) || compact.includes(term)) &&
      !cleaned.includes(term)
    ) {
      return {
        allowed: false,
        category: "OBFUSCATED_CONTACT",
        reason: `Obfuscated contact/ID phrase detected: '${term}'`,
        matchedPattern: term,
        normalizedContent: cleaned,
      };
    }
  }

  // Check for social handles in contact-sharing context:
  // e.g. "follow @username", "my insta @username", "message @username there", "contact @username"
  const socialKeywords =
    "follow|my insta|insta|instagram|snap|snapchat|telegram|whatsapp|message|contact|add|find";
  const handlePattern = "@\\s*[a-z0-9_.-]{3,30}";
  const socialContactContextRegex = new RegExp(
    `\\b(${socialKeywords})\\b.*${handlePattern}|${handlePattern}.*\\b(${socialKeywords})\\b`,
    "gi"
  );

  if (
    socialContactContextRegex.test(cleaned) ||
    socialContactContextRegex.test(deobfuscated)
  ) {
    const matched =
      cleaned.match(socialContactContextRegex)?.[0] ||
      deobfuscated.match(socialContactContextRegex)?.[0] ||
      "Social Contact Context";
    return {
      allowed: false,
      category: "SOCIAL_CONTACT",
      reason: `Social handle contact sharing context detected: '${matched}'`,
      matchedPattern: matched,
      normalizedContent: cleaned,
    };
  }

  // Clean - allowed message
  return { allowed: true };
}

/**
 * Helper function returning boolean
 */
export function containsContactInformation(content: string): boolean {
  const result = validateMessageContent(content);
  return !result.allowed;
}

/**
 * Centralized Moderation Violation Handler
 * 1. Creates or updates a ChatViolation record.
 * 2. Emits real-time Socket.IO event 'moderationViolation:new' to admin room 'admin_moderation'.
 */
export async function handleModerationViolation({
  senderId,
  receiverId,
  content,
  moderationResult,
  source = "REST",
  conversationId,
}: {
  senderId: string | Types.ObjectId;
  receiverId?: string | Types.ObjectId;
  content: string;
  moderationResult: ModerationResult;
  source?: string;
  conversationId?: string | Types.ObjectId;
}): Promise<IChatViolation> {
  const targetReceiver = receiverId || senderId;
  const violationType = moderationResult.category || "CONTACT_SHARING";

  // Abuse prevention: Check if recent duplicate violation exists within 5 mins
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  let violation = await ChatViolation.findOne({
    sender: senderId,
    receiver: targetReceiver,
    violationType,
    createdAt: { $gte: fiveMinsAgo },
  });

  if (violation) {
    violation.attemptCount = (violation.attemptCount || 1) + 1;
    violation.content = content;
    violation.normalizedContent = moderationResult.normalizedContent || content;
    violation.reason = moderationResult.reason;
    violation.matchedPattern = moderationResult.matchedPattern;
    await violation.save();
  } else {
    violation = await ChatViolation.create({
      sender: senderId,
      receiver: targetReceiver,
      content,
      normalizedContent: moderationResult.normalizedContent || content,
      violationType,
      reason: moderationResult.reason,
      matchedPattern: moderationResult.matchedPattern,
      severity: "HIGH",
      status: "PENDING",
      source,
      actionTaken: "NONE",
    });
  }

  // Real-time Socket.IO broadcast to admin room 'admin_moderation'
  try {
    const { getIO } = require("../sockets");
    const io = getIO();
    if (io) {
      const senderUser = await User.findById(senderId)
        .select("name userId email image role")
        .lean();

      const violationPayload = {
        violationId: String(violation._id),
        userId: String(senderId),
        user: senderUser
          ? {
              _id: String(senderUser._id),
              userId: senderUser.userId,
              name: senderUser.name,
              email: senderUser.email,
              image: senderUser.image,
              role: senderUser.role,
            }
          : undefined,
        category: violationType,
        source,
        createdAt: violation.createdAt,
        status: violation.status,
      };

      io.to("admin_moderation").emit("moderationViolation:new", violationPayload);
      io.to("admin_moderation").emit("moderation_violation:new", violationPayload);
    }
  } catch (sockErr: any) {
    console.warn("Socket broadcast warning for moderation violation:", sockErr?.message);
  }

  return violation;
}

