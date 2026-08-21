import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/errorHandler';

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something broke!';
  
  res.status(statusCode).json({
    success: false,
    message: message,
    error: err.name || 'Error'
  });
};

export default errorHandler;