import assert from "node:assert";
import { test, describe } from "node:test";
import {
  mapScoreToRiskLevel,
} from "../services/moderationRiskService";
import { MODERATION_RISK_CONFIG } from "../config/moderationRiskConfig";

describe("Trust & Safety Risk Scoring & Intelligence System Tests", () => {
  // Test 1: Score Mapping
  test("1. Score to Risk Level mapping functions accurately", () => {
    assert.strictEqual(mapScoreToRiskLevel(0), "LOW");
    assert.strictEqual(mapScoreToRiskLevel(20), "LOW");
    assert.strictEqual(mapScoreToRiskLevel(25), "MEDIUM");
    assert.strictEqual(mapScoreToRiskLevel(45), "MEDIUM");
    assert.strictEqual(mapScoreToRiskLevel(50), "HIGH");
    assert.strictEqual(mapScoreToRiskLevel(74), "HIGH");
    assert.strictEqual(mapScoreToRiskLevel(75), "CRITICAL");
    assert.strictEqual(mapScoreToRiskLevel(100), "CRITICAL");
  });

  // Test 2: Category Base Points Configuration
  test("2. Category points are configured correctly", () => {
    const pts = MODERATION_RISK_CONFIG.categoryPoints;
    assert.strictEqual(pts.DIGIT, 5);
    assert.strictEqual(pts.NUMBER_WORD, 6);
    assert.strictEqual(pts.PHONE_NUMBER, 15);
    assert.strictEqual(pts.ID_SHARING, 12);
    assert.strictEqual(pts.URL, 15);
    assert.strictEqual(pts.DOMAIN, 12);
    assert.strictEqual(pts.EMAIL, 20);
    assert.strictEqual(pts.SOCIAL_CONTACT, 15);
    assert.strictEqual(pts.OBFUSCATED_CONTACT, 25);
  });

  // Test 3: Time Decay Factors
  test("3. Time decay configuration matches specified model", () => {
    const decay = MODERATION_RISK_CONFIG.decay;
    assert.strictEqual(decay.sevenDays.factor, 0.85); // 15% reduction
    assert.strictEqual(decay.thirtyDays.factor, 0.50); // 50% reduction
    assert.strictEqual(decay.ninetyDays.factor, 0.10); // 90% reduction
  });

  // Test 4: Escalation Weights
  test("4. Escalation weights are configured correctly", () => {
    const w = MODERATION_RISK_CONFIG.escalationWeights;
    assert.strictEqual(w.WARNING, 0);
    assert.strictEqual(w.TEMPORARY_CHAT_MUTE, 10);
    assert.strictEqual(w.EXTENDED_CHAT_MUTE, 20);
    assert.strictEqual(w.ACCOUNT_REVIEW_REQUIRED, 30);
  });
});
