import jwt from "jsonwebtoken";
import { config } from "../configs/envConfig";

export const generateToken = (userId: string, type: "access" | "refresh") => {
    const secret = type === "access" ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new Error(`Missing JWT secret for ${type} token`);
    }

    const expiresIn = type === "access" ? "15m" : "7d";
    return jwt.sign({ userId }, secret, { expiresIn });
};






export function generateRandomName() {
    const words = ["Dragon", "Phoenix", "Tiger", "Griffin", "Wolf", "Falcon", "Shadow", "Storm", "Blaze", "Raven"];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    const randomNumber = Math.floor(100 + Math.random() * 900); // Generates a number between 100-999
    return randomWord + randomNumber;
}

export const generateUniqueId = (): number => {
    return Math.floor(100000 + Math.random() * 900000);
};