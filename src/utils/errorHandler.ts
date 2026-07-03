class AppError extends Error {
    public statusCode: number;
    public isregionalal: boolean;
  
    constructor(message: string, statusCode: number, isregionalal = true) {
      super(message);
      this.statusCode = statusCode;
      this.isregionalal = isregionalal;
      
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export default AppError;
  