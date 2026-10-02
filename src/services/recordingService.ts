import { randomUUID } from 'crypto';
import { CallRecording } from '../models/callRecording.model';
import { ProcessingJob } from '../models/processingJob.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { getCallRecordingProvider } from './callRecordingProvider';
import { getIOOptional } from '../sockets';

const recordingEnabled = () => process.env.RECORDING_ENABLED === 'true';
const retentionDays = () => Math.max(1, Number(process.env.RECORDING_RETENTION_DAYS || 30));

export async function registerRecordingIntent(transactionId: string, callerConsent: boolean, policyVersion?: string) {
  if (!recordingEnabled() || !callerConsent) return null;
  const transaction = await CoinsTransaction.findById(transactionId).lean();
  if (!transaction) return null;
  return CallRecording.findOneAndUpdate(
    { callId: transaction._id },
    {
      $setOnInsert: {
        recordingId: randomUUID(), callId: transaction._id, callerId: transaction.userId, hostId: transaction.hostId,
        callType: 'voice', provider: process.env.CALL_RECORDING_PROVIDER || 'agora', status: 'awaiting_consent',
        retentionDeleteAt: new Date(Date.now() + retentionDays() * 86400000),
      },
      $set: { 'consent.caller': { granted: true, grantedAt: new Date(), policyVersion: policyVersion || process.env.RECORDING_CONSENT_POLICY_VERSION || '1' } },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function grantHostConsentAndStart(transactionId: string, hostConsent: boolean, policyVersion?: string) {
  if (!recordingEnabled() || !hostConsent) return null;
  const recording = await CallRecording.findOneAndUpdate(
    { callId: transactionId, 'consent.caller.granted': true, status: 'awaiting_consent' },
    { $set: { 'consent.host': { granted: true, grantedAt: new Date(), policyVersion: policyVersion || process.env.RECORDING_CONSENT_POLICY_VERSION || '1' }, status: 'starting' } },
    { new: true },
  ).select('+providerState');
  if (!recording) return null;

  const transaction = await CoinsTransaction.findById(transactionId).lean();
  const meta = transaction?.meta as any;
  if (!transaction || !meta?.recordingToken || !transaction.channelName) {
    recording.status = 'failed'; recording.processingStatus = 'failed'; await recording.save(); return recording;
  }
  const provider = getCallRecordingProvider(recording.provider);
  if (!provider.isConfigured()) {
    recording.status = 'failed'; recording.processingStatus = 'not_configured'; await recording.save(); return recording;
  }
  try {
    const session = await provider.start({ channelName: transaction.channelName, recordingId: recording.recordingId, recorderUid: String(meta.recordingAgoraUid), token: String(meta.recordingToken), callType: recording.callType });
    recording.providerState = { ...session, channelName: transaction.channelName };
    recording.status = 'recording'; recording.startedAt = new Date(); recording.processingStatus = 'not_started'; await recording.save();
    getIOOptional()?.to('admin_recordings').emit('recording:started', { recordingId: recording.recordingId, callId: String(recording.callId), startedAt: recording.startedAt });
    return recording;
  } catch (error: any) {
    recording.status = 'failed'; recording.processingStatus = 'failed'; await recording.save();
    await enqueueJob('recording_start', recording._id, `recording-start:${recording.id}`, { operation: 'start', error: error?.code || error?.message });
    return recording;
  }
}

export async function stopRecordingForCall(transactionId: string) {
  const recording = await CallRecording.findOne({ callId: transactionId, status: { $in: ['starting', 'recording', 'stopping'] } }).select('+providerState');
  if (!recording) return null;
  recording.status = 'stopping'; recording.endedAt = new Date();
  if (recording.startedAt) recording.durationSeconds = Math.max(0, Math.floor((recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000));
  await recording.save();
  return enqueueJob('recording_finalize', recording._id, `recording-stop:${recording.id}`, { operation: 'stop' });
}

export async function enqueueJob(type: 'recording_start' | 'recording_finalize' | 'transcription' | 'ai_analysis' | 'retention_cleanup', entityId: any, fingerprint: string, payload: Record<string, unknown> = {}) {
  return ProcessingJob.findOneAndUpdate(
    { fingerprint },
    { $setOnInsert: { type, entityType: entityId ? 'recording' : 'system', entityId, fingerprint, payload, status: 'queued', attempts: 0, maxAttempts: 5, nextRunAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}
