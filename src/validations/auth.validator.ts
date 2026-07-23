import { body } from "express-validator";

export const validationCheckUser = [
  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isMobilePhone("any")
    .withMessage("Invalid phone number format"),
];

export const validationResetPassword = [
  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isMobilePhone("any")
    .withMessage("Invalid phone number format"),

  body("newPassword")
    .notEmpty()
    .withMessage("New Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
];

export const validationUserCreate = [
  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .isMobilePhone("any")
    .withMessage("Invalid phone number format"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),

  body("age")
    .optional()
    .isInt({ min: 1, max: 120 })
    .withMessage("Age must be a valid integer between 1 and 120"),
];

export const validationUserLogin = [
  body("phoneNumber")
    .optional()
    .isMobilePhone("any")
    .withMessage("Invalid phone number format"),

  body("userId")
    .optional()
    .isString()
    .trim()
    .withMessage("User ID must be a valid string"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
];

export const validationGoogleAuth = [
  body("googleIdToken")
    .notEmpty()
    .withMessage("Google ID token is required")
    .isString()
    .withMessage("Google ID token must be a string"),

  // You might optionally want to validate deviceId if you always expect it
  body("deviceId")
    .optional()
    .isString()
    .withMessage("Device ID must be a string"),
];
