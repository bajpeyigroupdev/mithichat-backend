import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessRecording } from '../middlewares/recordingPermission.middleware';

test('recording metadata is limited to management roles', () => {
  assert.equal(canAccessRecording('owner', 'view'), true);
  assert.equal(canAccessRecording('superAdmin', 'view'), true);
  assert.equal(canAccessRecording('admin', 'view'), true);
  assert.equal(canAccessRecording('operator', 'view'), true);
  assert.equal(canAccessRecording('customerSupport', 'view'), false);
  assert.equal(canAccessRecording('host', 'view'), false);
  assert.equal(canAccessRecording('user', 'view'), false);
});

test('recording media and destructive actions require explicit grants', () => {
  assert.equal(canAccessRecording('superAdmin', 'playback'), false);
  assert.equal(canAccessRecording('admin', 'delete'), false);
  assert.equal(canAccessRecording('operator', 'review'), false);
  assert.equal(canAccessRecording('admin', 'playback', ['Recordings'], ['Playback']), true);
  assert.equal(canAccessRecording('operator', 'review', ['recording'], ['review']), true);
  assert.equal(canAccessRecording('superAdmin', 'delete', ['*'], ['*']), true);
});

test('recording permissions do not accept adjacent or client-invented actions', () => {
  assert.equal(canAccessRecording('admin', 'download', ['Recordings'], ['playback']), false);
  assert.equal(canAccessRecording('fakeOwner', 'delete', ['Recordings'], ['Delete']), true);
  assert.equal(canAccessRecording('fakeOwner', 'delete'), false);
});
