import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sanitizeCredentialsForViewer,
  sanitizeRequestForViewer,
  shouldRedactRequestSecrets,
} from '../utils/requestResponseSanitizer';

test('request secret visibility follows the management hierarchy', () => {
  assert.equal(shouldRedactRequestSecrets('superAdmin', 'Admin Request'), true);
  assert.equal(shouldRedactRequestSecrets('super-admin', 'Customer Support Request'), true);
  assert.equal(shouldRedactRequestSecrets('admin', 'Agency Request'), true);
  assert.equal(shouldRedactRequestSecrets('admin', 'Host Request'), true);
  assert.equal(shouldRedactRequestSecrets('agency', 'Host Request'), true);
  assert.equal(shouldRedactRequestSecrets(undefined, 'Host Request'), true);
  assert.equal(shouldRedactRequestSecrets('owner', 'Host Request'), false);
  assert.equal(shouldRedactRequestSecrets('operator', 'Agency Request'), false);
  assert.equal(shouldRedactRequestSecrets('agency', 'Agency Request'), false);
});

test('restricted request responses omit documents and plaintext passwords', () => {
  const response = sanitizeRequestForViewer({
    role: 'host',
    passwordBeforeApproval: 'Secret123',
    documents: [{ url: 'top-level-document' }],
    data: {
      password: 'Secret123',
      documents: [{ url: 'document-url' }],
      aadhaarFront: 'aadhaar-url',
      selfieWithIdCard: 'selfie-url',
      voiceAudioUrl: 'voice-url',
      email: 'host@example.com',
    },
  }, 'agency');

  assert.equal(response.passwordBeforeApproval, undefined);
  assert.equal(response.documents, undefined);
  assert.equal(response.data.password, undefined);
  assert.equal(response.data.documents, undefined);
  assert.equal(response.data.aadhaarFront, undefined);
  assert.equal(response.data.selfieWithIdCard, undefined);
  assert.equal(response.data.voiceAudioUrl, 'voice-url');
  assert.equal(response.data.email, 'host@example.com');
});

test('restricted approval credentials omit only the password', () => {
  const credentials = sanitizeCredentialsForViewer({
    email: 'host@example.com',
    password: 'Secret123',
    specialCode: 'HOST-1',
  }, 'admin', 'host');

  assert.deepEqual(credentials, {
    email: 'host@example.com',
    specialCode: 'HOST-1',
  });
});
