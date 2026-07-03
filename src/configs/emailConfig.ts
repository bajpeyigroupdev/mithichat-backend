import nodemailer from "nodemailer";
import { config } from "./envConfig";

export const transporter = nodemailer.createTransport({
   service: "Gmail",
    auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS,
    },
});