import assert from "node:assert";
import { test, describe } from "node:test";
import {
  validateMessageContent,
  containsContactInformation,
  CLIENT_VIOLATION_MESSAGE,
} from "../services/messageModerationService";
import { detectChatViolation } from "../utils/chatModeration";

describe("Anti-Contact Sharing & Message Moderation System", () => {
  describe("Strict Digit Policy Tests", () => {
    const digitTests = [
      "9876543210",
      "98 765 432 10",
      "98-765-432-10",
      "98.765.432.10",
      "9️⃣8️⃣7️⃣",
      "①②③",
      "１２３",
      "call me at 9",
      "my room number is 5",
      "0",
    ];

    for (const input of digitTests) {
      test(`Blocks digit message: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.ok(
          result.category === "DIGIT" || result.category === "PHONE_NUMBER",
          `Expected DIGIT or PHONE_NUMBER category for '${input}', got '${result.category}'`
        );
        assert.strictEqual(containsContactInformation(input), true);
      });
    }
  });

  describe("English Number Word Detection Tests", () => {
    const enWordTests = [
      "one two three",
      "nine eight seven",
      "n i n e",
      "o.n.e t.w.o",
      "o-n-e",
      "t_w_o",
      "my number is nine eight seven",
      "call me zero",
    ];

    for (const input of enWordTests) {
      test(`Blocks English number word: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.ok(
          result.category === "NUMBER_WORD" ||
            result.category === "OBFUSCATED_CONTACT",
          `Expected NUMBER_WORD or OBFUSCATED_CONTACT category for '${input}', got '${result.category}'`
        );
      });
    }
  });

  describe("Hindi / Hinglish Number Word Detection Tests", () => {
    const hiWordTests = [
      "ek do teen",
      "paanch",
      "chaar",
      "shunya",
      "mera number nau aath saat hai",
      "che",
    ];

    for (const input of hiWordTests) {
      test(`Blocks Hindi/Hinglish number word: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.ok(
          result.category === "NUMBER_WORD" ||
            result.category === "OBFUSCATED_CONTACT",
          `Expected NUMBER_WORD or OBFUSCATED_CONTACT category for '${input}', got '${result.category}'`
        );
      });
    }
  });

  describe("ID and Username Sharing Detection Tests", () => {
    const idTests = [
      "my id is",
      "mera id",
      "meri id",
      "send id",
      "search my id",
      "add me by id",
      "username is",
      "whatsapp number",
      "telegram id",
      "my insta id",
      "m y i d",
      "u s e r n a m e",
      "i n s t a i d",
      "follow @username",
      "my insta @username",
      "message @username there",
    ];

    for (const input of idTests) {
      test(`Blocks ID/contact sharing phrase: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.ok(
          result.category === "ID_SHARING" ||
            result.category === "OBFUSCATED_CONTACT" ||
            result.category === "SOCIAL_CONTACT",
          `Expected ID_SHARING, OBFUSCATED_CONTACT, or SOCIAL_CONTACT category for '${input}', got '${result.category}'`
        );
      });
    }
  });

  describe("URL and Domain Detection Tests", () => {
    const urlTests = [
      "http://example.com",
      "https://example.com",
      "www.example.com",
      "example.com",
      "bit.ly/xyz",
      "t.me/user",
      "wa.me/xyz",
      "example dot com",
      "www dot example dot com",
      "w w w dot example dot com",
    ];

    for (const input of urlTests) {
      test(`Blocks URL/Domain: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.ok(
          result.category === "URL" || result.category === "DOMAIN",
          `Expected URL or DOMAIN category for '${input}', got '${result.category}'`
        );
      });
    }
  });

  describe("Email Detection Tests", () => {
    const emailTests = [
      "name@example.com",
      "name @ gmail dot com",
      "name at gmail dot com",
    ];

    for (const input of emailTests) {
      test(`Blocks Email: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, false);
        assert.strictEqual(result.category, "EMAIL");
      });
    }
  });

  describe("Allowed Normal Messages Tests", () => {
    const normalMessages = [
      "hello how are you",
      "good morning",
      "khana khaya",
      "aaj mausam accha hai",
      "aap kahan se ho",
      "kaise ho aap",
    ];

    for (const input of normalMessages) {
      test(`Allows normal message: '${input}'`, () => {
        const result = validateMessageContent(input);
        assert.strictEqual(result.allowed, true);
        assert.strictEqual(containsContactInformation(input), false);
      });
    }
  });

  describe("Backward Compatibility Wrapper Tests", () => {
    test("detectChatViolation returns expected object format", () => {
      const blocked = detectChatViolation("9876543210");
      assert.strictEqual(blocked.isViolated, true);
      assert.ok(blocked.type);

      const allowed = detectChatViolation("hello how are you");
      assert.strictEqual(allowed.isViolated, false);
    });
  });

  describe("RBAC Room & API Authorization Security Tests", () => {
    test("Owner and SuperAdmin always have moderation access", async () => {
      const { PermissionEngine } = await import("../utils/permissionEngine");

      const ownerAccess = await PermissionEngine.hasModerationPermission(
        { id: "fakeOwner", role: "owner" },
        "view"
      );
      const superAdminAccess = await PermissionEngine.hasModerationPermission(
        { id: "fakeSuperAdmin", role: "superAdmin" },
        "view"
      );

      assert.strictEqual(ownerAccess, true);
      assert.strictEqual(superAdminAccess, true);
    });

    test("Admin and Operator pass with explicit moderation:view permission", async () => {
      const { PermissionEngine } = await import("../utils/permissionEngine");

      const adminWithPerm = await PermissionEngine.hasModerationPermission(
        { id: "admin1", role: "admin", permissions: ["moderation:view"] },
        "view"
      );
      const operatorWithPerm = await PermissionEngine.hasModerationPermission(
        { id: "operator1", role: "operator", permissions: ["moderation:view"] },
        "view"
      );

      assert.strictEqual(adminWithPerm, true);
      assert.strictEqual(operatorWithPerm, true);
    });

    test("Admin and Operator fail without moderation permissions", async () => {
      const { PermissionEngine } = await import("../utils/permissionEngine");

      const adminNoPerm = await PermissionEngine.hasModerationPermission(
        { id: "adminNoPerm", role: "admin", permissions: ["reports:view"] },
        "unmute"
      );
      const operatorNoPerm = await PermissionEngine.hasModerationPermission(
        { id: "operatorNoPerm", role: "operator", permissions: ["reports:view"] },
        "unmute"
      );

      assert.strictEqual(adminNoPerm, false);
      assert.strictEqual(operatorNoPerm, false);
    });

    test("Normal user and fake client-provided roles are denied access", async () => {
      const { PermissionEngine } = await import("../utils/permissionEngine");

      const normalUser = await PermissionEngine.hasModerationPermission(
        { id: "user1", role: "user", permissions: ["moderation:view"] },
        "view"
      );
      const hostUser = await PermissionEngine.hasModerationPermission(
        { id: "host1", role: "host" },
        "view"
      );
      const fakeRole = await PermissionEngine.hasModerationPermission(
        { id: "fake1", role: "hacker_owner" },
        "view"
      );

      assert.strictEqual(normalUser, false);
      assert.strictEqual(hostUser, false);
      assert.strictEqual(fakeRole, false);
    });
  });

  describe("Automatic Escalation & Thresholds System Tests", () => {
    test("Escalation configuration thresholds are correctly loaded", async () => {
      const { MODERATION_ESCALATION } = await import("../configs/moderationEscalationConfig");

      assert.strictEqual(MODERATION_ESCALATION.warning.violations, 1);
      assert.strictEqual(MODERATION_ESCALATION.temporaryMute.violations, 3);
      assert.strictEqual(MODERATION_ESCALATION.temporaryMute.muteMinutes, 30);
      assert.strictEqual(MODERATION_ESCALATION.extendedMute.violations, 5);
      assert.strictEqual(MODERATION_ESCALATION.extendedMute.muteHours, 24);
      assert.strictEqual(MODERATION_ESCALATION.accountReview.violations, 8);
    });
  });
});

