interface SuccessDetail {
  code: string;
  message: string;
  statusCode: number;
}

interface SuccessCodes {
  [key: string]: SuccessDetail;
}

const SUCCESS_CODES: SuccessCodes = {
  // 🧑‍💼 User
  USER_CREATED: {
    code: 'USER_201',
    message: 'User created successfully.',
    statusCode: 201,
  },
  USER_LOGGED_IN: {
    code: 'USER_200',
    message: 'User logged in successfully.',
    statusCode: 200,
  },

  // 🛒 Product
  PRODUCT_CREATED: {
    code: 'PRODUCT_201',
    message: 'Product created successfully.',
    statusCode: 201,
  },
  PRODUCT_FETCHED: {
    code: 'PRODUCT_200',
    message: 'Product fetched successfully.',
    statusCode: 200,
  },

  // 🔄 Generic
  SUCCESS: {
    code: 'GENERIC_200',
    message: 'Request completed successfully.',
    statusCode: 200,
  },
  UPDATED: {
    code: 'GENERIC_200_UPDATE',
    message: 'Resource updated successfully.',
    statusCode: 200,
  },
  DELETED: {
    code: 'GENERIC_200_DELETE',
    message: 'Resource deleted successfully.',
    statusCode: 200,
  },
};

export default SUCCESS_CODES;
