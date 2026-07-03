import { Socket } from "socket.io";
import { ExtendedError } from "socket.io/dist/namespace";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { User } from "../models/user.model";
import { config } from "../configs/envConfig";
import { Types } from "mongoose";

interface DecodedToken {
    userId: number;
}

export interface AuthenticatedSocket extends Socket {
    user?: {
        role: "superAdmin" | "admin" | "host" | "user";
        userId: number;
        id: Types.ObjectId;
        name: string;
        gender: string;
        coins: number;
    };
}

export const socketAuth = async (
    socket: AuthenticatedSocket,
    next: (err?: ExtendedError) => void
) => {
    try {
        // 1️⃣ Token extract from headers or query
        const token =
            (socket.handshake.auth?.token as string) ||
            (socket.handshake.headers?.authorization?.split(" ")[1] as string) ||
            (socket.handshake.query?.token as string);

        if (!token) {
            return next(new Error("Unauthorized - No token provided"));
        }

        // 2️⃣ Verify JWT
        const decoded = jwt.verify(
            token,
            config.JWT_ACCESS_SECRET as string
        ) as DecodedToken;

        if (!decoded.userId) {
            return next(new Error("Unauthorized - Invalid token payload"));
        }

        // 3️⃣ Find user
        const user = await User.findOne({ userId: decoded.userId, isDeleted: false });

        if (!user) {
            return next(new Error("Unauthorized - User not found"));
        }

        // 4️⃣ Attach user to socket
        socket.user = {
            role: user.role ?? "user",
            userId: user.userId,
            id: user._id as Types.ObjectId,
            name: user.name as any,
            gender: user.gender as any,
            coins: user.coins as any,
        };

        return next();
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            return next(new Error("Unauthorized - Token expired"));
        }
        if (error instanceof JsonWebTokenError) {
            return next(new Error("Unauthorized - Invalid token"));
        }
        return next(new Error("Internal Server Error"));
    }
};
