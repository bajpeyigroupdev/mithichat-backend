import dotenv from "dotenv";
dotenv.config();

export const config = {
    PORT: process.env.PORT || 3001,
    MONGO_URI: process.env.MONGO_URI,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    ENCRYPTION_SECRET_KEY: process.env.ENCRYPTION_SECRET_KEY,
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_PHONE: process.env.SUPER_ADMIN_PHONE,
    SUPER_ADMIN_ROLE: process.env.SUPER_ADMIN_ROLE,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    AGORA_APP_ID: process.env.AGORA_APP_ID,
    AGORA_APP_CERTIFICATE: process.env.APP_CERTIFICATE,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    ORIGIN: process.env.ORIGIN,
    ORIGIN1: process.env.ORIGIN1,
    WEB_HOOK_PORT: process.env.WEB_HOOK_PORT || 4000,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    FAST2SMS_API_KEY: process.env.FAST2SMS_API_KEY || '',
}