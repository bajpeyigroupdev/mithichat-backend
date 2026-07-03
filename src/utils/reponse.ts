import { Response } from "express";

const sendResponse = <T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T,
  pagination?: {
    totalUsers: number;
    currentPage: number;
    totalPages: number;
    limit: number;
  }
) => {
  res.status(statusCode).json({
    success,
    message,
    statusCode,
    ...(data && { data }),
    ...(pagination && { pagination }),
  });
};

export default sendResponse;

