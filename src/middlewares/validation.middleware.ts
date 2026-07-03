import { validationResult, ValidationError } from "express-validator";
import { Request, Response, NextFunction } from "express";

export const requestValidator = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err: ValidationError) => ({
        field: (err as any).path || (err as any).param, // Handle both cases
        message: err.msg,
      })),
    });
  }
  next();
};
