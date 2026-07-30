import test from "node:test";
import assert from "node:assert/strict";
import { decryptSensitive, encryptSensitive, maskSensitive, sanitizeStorageKey } from "../utils/verificationSecurity";

process.env.VERIFICATION_ENCRYPTION_KEY = "test-only-verification-encryption-key";

test("encrypts sensitive values and decrypts only to the original value", () => {
  const encrypted = encryptSensitive("ABCDE1234F");
  assert.notEqual(encrypted, "ABCDE1234F");
  assert.equal(decryptSensitive(encrypted), "ABCDE1234F");
});

test("masks document and account numbers", () => {
  assert.equal(maskSensitive("ABCDE1234F"), "ABCD****4F");
  assert.equal(maskSensitive("123456789012", 0, 4), "********9012");
});

test("accepts only random image storage key shapes", () => {
  assert.equal(sanitizeStorageKey("123e4567-e89b-12d3-a456-426614174000.jpg"), "123e4567-e89b-12d3-a456-426614174000.jpg");
  assert.throws(() => sanitizeStorageKey("../secret.env"));
  assert.throws(() => sanitizeStorageKey("payload.svg"));
});
