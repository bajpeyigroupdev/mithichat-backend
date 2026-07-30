import crypto from "crypto";

const secret = () => process.env.VERIFICATION_ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET_KEY || "";
const key = () => {
  const value = secret();
  if (!value) throw new Error("VERIFICATION_ENCRYPTION_KEY is not configured");
  return crypto.createHash("sha256").update(value).digest();
};

export const encryptSensitive = (plain: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
};

export const decryptSensitive = (payload: string) => {
  const [iv, tag, encrypted] = payload.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
};

export const maskSensitive = (value: string, prefix = 4, suffix = 2) => {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= prefix + suffix) return "*".repeat(normalized.length);
  return `${normalized.slice(0, prefix)}${"*".repeat(Math.max(4, normalized.length - prefix - suffix))}${normalized.slice(-suffix)}`;
};

export const sanitizeStorageKey = (key: string) => {
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png)$/i.test(key)) throw new Error("Invalid storage key");
  return key;
};
