import { detectChatViolation } from "../utils/chatModeration";

export function runChatModerationTests() {
  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      throw new Error(`TEST FAILED: ${msg}`);
    }
  };

  // 1. BLOCKED EXAMPLES
  assert(detectChatViolation("9876543210").isViolated === true, "Should block 9876543210");
  assert(detectChatViolation("98765 43210").isViolated === true, "Should block space-separated phone");
  assert(detectChatViolation("9-8-7-6-5-4-3-2-1-0").isViolated === true, "Should block dash-separated phone");
  assert(detectChatViolation("one two three four five six seven eight nine zero").isViolated === true, "Should block EN number words");
  assert(detectChatViolation("ek do teen chaar paanch chhe saat aath nau").isViolated === true, "Should block HI number words");
  assert(detectChatViolation("@username").isViolated === true, "Should block @username handle");
  assert(detectChatViolation("insta @username").isViolated === true, "Should block insta @username");
  assert(detectChatViolation("https://google.com").isViolated === true, "Should block https URL");
  assert(detectChatViolation("google.com").isViolated === true, "Should block raw domain");
  assert(detectChatViolation("t.me/test").isViolated === true, "Should block t.me link");
  assert(detectChatViolation("wa.me/919876543210").isViolated === true, "Should block wa.me link");

  // 2. LEGITIMATE EXAMPLES (False positive protection)
  assert(detectChatViolation("I have one question").isViolated === false, "Allow 'I have one question'");
  assert(detectChatViolation("give me two minutes").isViolated === false, "Allow 'give me two minutes'");
  assert(detectChatViolation("I have 500 coins").isViolated === false, "Allow 'I have 500 coins'");
  assert(detectChatViolation("room 123").isViolated === false, "Allow 'room 123'");
  assert(detectChatViolation("level 10").isViolated === false, "Allow 'level 10'");
  assert(detectChatViolation("come in room 5").isViolated === false, "Allow 'come in room 5'");
  assert(detectChatViolation("do you want to play?").isViolated === false, "Allow 'do you want to play?'");
  assert(detectChatViolation("one more game").isViolated === false, "Allow 'one more game'");

  console.log("✅ All Chat Moderation Unit Tests Passed Successfully!");
}

// Auto-run when executed directly
if (require.main === module) {
  runChatModerationTests();
}
