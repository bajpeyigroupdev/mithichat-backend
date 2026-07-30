import test from "node:test";
import assert from "node:assert/strict";
import { canVerificationTransition, validateResubmissionFields } from "../utils/verificationRules";

test("allows the explicit manual-review status workflow", () => {
  assert.equal(canVerificationTransition("PENDING", "UNDER_REVIEW"), true);
  assert.equal(canVerificationTransition("UNDER_REVIEW", "APPROVED"), true);
  assert.equal(canVerificationTransition("UNDER_REVIEW", "REJECTED"), true);
  assert.equal(canVerificationTransition("UNDER_REVIEW", "RESUBMISSION_REQUIRED"), true);
  assert.equal(canVerificationTransition("RESUBMISSION_REQUIRED", "PENDING"), true);
});

test("blocks repeated or invalid review transitions", () => {
  assert.equal(canVerificationTransition("APPROVED", "REJECTED"), false);
  assert.equal(canVerificationTransition("PENDING", "APPROVED"), false);
  assert.equal(canVerificationTransition("UNDER_REVIEW", "UNDER_REVIEW"), false);
});

test("accepts only selected allowed resubmission fields", () => {
  const allowed = new Set(["faceSelfie", "documentFront"]);
  assert.equal(validateResubmissionFields(["faceSelfie"], allowed), true);
  assert.equal(validateResubmissionFields([], allowed), false);
  assert.equal(validateResubmissionFields(["bankDetails"], allowed), false);
});
