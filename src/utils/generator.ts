import jwt from "jsonwebtoken";
import { config } from "../configs/envConfig";

export const generateToken = (userId: string | number, type: "access" | "refresh") => {
    const secret = type === "access" ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new Error(`Missing JWT secret for ${type} token`);
    }

    const numericUserId = typeof userId === 'number' ? userId : (parseInt(String(userId), 10) || userId);
    const expiresIn = type === "access" ? "7d" : "30d";
    return jwt.sign({ userId: numericUserId }, secret, { expiresIn });
};






export function generateRandomName() {
    const words = ["Dragon", "Phoenix", "Tiger", "Griffin", "Wolf", "Falcon", "Shadow", "Storm", "Blaze", "Raven"];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    const randomNumber = Math.floor(100 + Math.random() * 900); // Generates a number between 100-999
    return randomWord + randomNumber;
}

import { Counter } from "../models/counter.model";

export const generateUniqueId = async (): Promise<number> => {
    try {
        const counterDoc = await Counter.findOneAndUpdate(
            { modelName: "user" },
            { $inc: { seq: 1 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        if (!counterDoc || counterDoc.seq < 1000000001) {
            const updated = await Counter.findOneAndUpdate(
                { modelName: "user" },
                { $set: { seq: 1000000001 } },
                { new: true, upsert: true }
            );
            return updated?.seq || 1000000001;
        }

        return counterDoc.seq;
    } catch (error) {
        console.error("Error generating 10-digit sequential userId:", error);
        return Math.floor(1000000000 + Math.random() * 9000000000);
    }
};