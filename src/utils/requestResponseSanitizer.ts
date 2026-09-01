const DOCUMENT_FIELDS = [
  'documents',
  'document',
  'adharFront',
  'adharFrontUrl',
  'aadhaarFront',
  'aadhaarFrontUrl',
  'adharBack',
  'adharBackUrl',
  'aadhaarBack',
  'aadhaarBackUrl',
  'pan',
  'panCard',
  'panCardUrl',
  'panCopyUrl',
  'selfieWithIdCard',
  'idProof',
  'idProofUrl',
  'addressProof',
  'addressProofUrl',
  'resume',
  'resumeUrl',
  'experienceLetter',
  'experienceLetterUrl',
  'educationCertUrl',
  'govtIdUrl',
  'securityConsentUrl',
  'policeVerificationUrl',
  'managerPhotoUrl',
  'photoUrl',
] as const;

const PASSWORD_FIELDS = [
  'password',
  'plainPassword',
  'temporaryPassword',
  'generatedPassword',
] as const;

export const normalizeRequestRole = (role?: string): string => {
  const normalized = String(role || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized.includes('superadmin')) return 'superAdmin';
  if (normalized.includes('customersupport') || normalized.includes('customerservice')) return 'customerSupport';
  if (normalized.includes('agency')) return 'agency';
  if (normalized.includes('host')) return 'host';
  if (normalized.includes('admin')) return 'admin';
  return normalized;
};

export const shouldRedactRequestSecrets = (viewerRole?: string, targetRole?: string): boolean => {
  const viewer = normalizeRequestRole(viewerRole);
  const target = normalizeRequestRole(targetRole);

  if (!viewer) return true;
  if (viewer === 'superAdmin') {
    return ['admin', 'agency', 'host', 'customerSupport'].includes(target);
  }
  if (viewer === 'admin') {
    return ['agency', 'host', 'customerSupport'].includes(target);
  }
  return viewer === 'agency' && target === 'host';
};

const deleteFields = (target: Record<string, any>, fields: readonly string[]) => {
  fields.forEach((field) => delete target[field]);
};

export const sanitizeRequestForViewer = (request: any, viewerRole?: string): any => {
  const source = request?.toObject ? request.toObject() : request;
  if (!source || typeof source !== 'object') return source;

  const sanitized = {
    ...source,
    data: source.data && typeof source.data === 'object' ? { ...source.data } : source.data,
  };
  const targetRole = sanitized.role || sanitized.requestType || sanitized.data?.role;

  if (!shouldRedactRequestSecrets(viewerRole, targetRole)) return sanitized;

  delete sanitized.passwordBeforeApproval;
  deleteFields(sanitized, [...DOCUMENT_FIELDS, ...PASSWORD_FIELDS]);
  if (sanitized.data && typeof sanitized.data === 'object') {
    deleteFields(sanitized.data, [...DOCUMENT_FIELDS, ...PASSWORD_FIELDS]);
  }

  return sanitized;
};

export const sanitizeCredentialsForViewer = (
  credentials: Record<string, any> | null,
  viewerRole?: string,
  targetRole?: string
) => {
  if (!credentials || !shouldRedactRequestSecrets(viewerRole, targetRole)) return credentials;
  const sanitized = { ...credentials };
  deleteFields(sanitized, PASSWORD_FIELDS);
  return sanitized;
};
