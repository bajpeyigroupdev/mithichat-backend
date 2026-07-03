import bcrypt from "bcryptjs";

const CUSTOM_SALT_ROUNDS = 6;

export const generateSecureHash = async (plainPassword: string): Promise<string> => {
  const salt = await bcrypt.genSalt(CUSTOM_SALT_ROUNDS);
  return await bcrypt.hash(plainPassword, salt);
};

export const verifySecureHash = async (
  plainPassword: string,
  storedHash: string
): Promise<boolean> => {
  return await bcrypt.compare(plainPassword, storedHash);
};
