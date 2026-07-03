// Define the shape of each error
interface ErrorDetail {
  code: string;
  message: string;
  statusCode: number;
}

// Define the full type for ERROR_CODES
interface ErrorCodes {
  [key: string]: ErrorDetail;
}

const ERROR_CODES: ErrorCodes = {
  // 🔐 Authentication & Authorization
  UNAUTHORIZED: {
    code: 'AUTH_401',
    message: 'Unauthorized access.',
    statusCode: 401,
  },
  FORBIDDEN: {
    code: 'AUTH_403',
    message: 'You do not have permission to perform this action.',
    statusCode: 403,
  },
  TOKEN_EXPIRED: {
    code: 'AUTH_419',
    message: 'Session expired. Please log in again.',
    statusCode: 419,
  },

  // 📦 User-related
  USER_NOT_FOUND: {
    code: 'USER_404',
    message: 'User not found.',
    statusCode: 404,
  },
  USER_ALREADY_EXISTS: {
    code: 'USER_409',
    message: 'User with this email already exists.',
    statusCode: 409,
  },

  // 🛒 Product-related
  PRODUCT_NOT_FOUND: {
    code: 'PRODUCT_404',
    message: 'Product not found.',
    statusCode: 404,
  },

  // 🗃️ Validation
  BAD_REQUEST: {
    code: 'VALIDATION_400',
    message: 'Bad request or validation failed.',
    statusCode: 400,
  },

  // ⚙️ Server
  INTERNAL_SERVER_ERROR: {
    code: 'SERVER_500',
    message: 'Something went wrong. Please try again later.',
    statusCode: 500,
  },
};

export default ERROR_CODES;
