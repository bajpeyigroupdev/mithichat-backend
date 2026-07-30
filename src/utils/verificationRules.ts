const transitions: Record<string, ReadonlySet<string>> = {
  PENDING: new Set(["UNDER_REVIEW", "CANCELLED"]),
  UNDER_REVIEW: new Set(["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"]),
  RESUBMISSION_REQUIRED: new Set(["PENDING"]),
  REJECTED: new Set(["PENDING"]),
  EXPIRED: new Set(["PENDING"]),
};

export const canVerificationTransition = (from: string, to: string) =>
  transitions[from]?.has(to) || false;

export const validateResubmissionFields = (fields: unknown, allowed: ReadonlySet<string>) =>
  Array.isArray(fields) && fields.length > 0 &&
  fields.every(field => typeof field === "string" && allowed.has(field));
