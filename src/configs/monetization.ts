/**
 * Authoritative money/coin rules.
 * Keep financial rules server-side so clients cannot change payout math.
 */
export const CALL_DIAMONDS_PER_MINUTE = 100;
export const WITHDRAWAL_COINS_PER_INR = 20;
export const MIN_WITHDRAWAL_INR = 200;
export const WITHDRAWAL_PLATFORM_FEE_PERCENT = 5;
export const MIN_WITHDRAWAL_COINS =
  WITHDRAWAL_COINS_PER_INR * MIN_WITHDRAWAL_INR;

export const HOST_LEVEL_COINS_PER_MINUTE: Record<number, number> = {
  1: 25,
  2: 30,
  3: 36,
  4: 42,
  5: 48,
  6: 54,
  7: 60,
  8: 66,
};
