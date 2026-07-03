import { body } from "express-validator";

export const validationUpdateUserLimited = [
  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage("Name cannot be longer than 20 characters"),

  body("bio")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Bio cannot be longer than 100 characters"),

  body("language")
    .optional()
    .isArray({ max: 2 })
    .withMessage("You can select a maximum of 2 languages"),

  body("language.*")
    .optional()
    .isString()
    .withMessage("Each language must be a string"),
];
