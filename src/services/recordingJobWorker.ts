import os from 'os';
import path from 'path';
import { ProcessingJob } from '../models/processingJob.model';
import { CallRecording } from '../models/callRecording.model';
import { getCallRecordingProvider } from './callRecordingProvider';
import { createRecordingPlaybackUrl, deleteRecordingObject } from './recordingStorage.service';
import { enqueueJob, grantHostConsentAndStart } from './recordingService';
import { getAIProvider } from './aiProvider';
import { AIUsage } from '../models/aiUsage.model';
import { ModerationAlert } from '../models/moderationAlert.model';
import { getIOOptional } from '../sockets';

let timer: NodeJS.Timeout | null = null;
const workerId = `${os.hostname()}:${process.pid}`;

async function processFinalize(recording: any) {
  const state = recording.providerState || {};
  if (!state.resourceId || !state.sessionId || !state.recorderUid || !state.channelName) throw new Error('Recording provider state is incomplete');
  const result = await getCallRecordingProvider(recording.provider).stop(state);
  const primary = result.files.find((file) => /\.(mp4|mp3|m4a|wav|webm|ogg)$/i.test(file.key)) || result.files[0];
  if (!primary) throw new Error('Recording provider returned no storage artifact');
  recording.storage = {
    provider: process.env.RECORDING_STORAGE_ENDPOINT ? 's3-compatible' : 'aws-s3',
    bucket: process.env.RECORDING_STORAGE_BUCKET || '', key: primary.key,
    region: process.env.RECORDING_STORAGE_REGION || 'ap-south-1', format: path.extname(primary.key).slice(1).toLowerCase(),
  };
  recording.status = 'completed'; recording.processingStatus = 'completed';
  recording.transcriptionStatus = process.env.TRANSCRIPTION_ENABLED === 'true' ? 'queued' : 'not_configured';
  recording.analysisStatus = process.env.AI_ANALYSIS_ENABLED === 'true' ? 'queued' : 'not_configured';
  await recording.save();
  if (process.env.TRANSCRIPTION_ENABLED === 'true') await enqueueJob('transcription', recording._id, `transcription:${recording.id}:${primary.key}`);
  getIOOptional()?.to('admin_recordings').emit('recording:completed', { recordingId: recording.recordingId, callId: String(recording.callId) });
}

async function processStart(recording: any) {
  recording.status = 'awaiting_consent';
  recording.processingStatus = 'queued';
  await recording.save();
  const started = await grantHostConsentAndStart(String(recording.callId), true, recording.consent?.host?.policyVersion);
  if (!started || started.status !== 'recording') throw new Error('Recording provider start retry failed');
}

async function processTranscription(recording: any) {
  if (!recording.storage?.key) throw new Error('Recording storage key is missing');
  if (!/\.(mp4|mp3|m4a|wav|webm|ogg|mpeg|mpga|flac)$/i.test(recording.storage.key)) {
    recording.transcriptionStatus = 'not_configured'; await recording.save(); return;
  }
  const provider = getAIProvider();
  if (!provider.isConfigured()) { recording.transcriptionStatus = 'not_configured'; await recording.save(); return; }
  recording.transcriptionStatus = 'processing'; await recording.save();
  const result = await provider.transcribeMedia(await createRecordingPlaybackUrl(recording.storage.key, 900), path.basename(recording.storage.key));
  recording.transcript = { text: result.text, language: result.language, segments: result.segments, provider: provider.name, model: provider.transcriptionModel };
  recording.transcriptionStatus = 'completed';
  recording.analysisStatus = process.env.AI_ANALYSIS_ENABLED === 'true' ? 'queued' : 'not_configured';
  await recording.save();
  await AIUsage.create({ provider: provider.name, model: provider.transcriptionModel, feature: 'transcription', entityType: 'recording', entityId: recording._id, inputTokens: result.usage?.inputTokens || 0, outputTokens: result.usage?.outputTokens || 0, audioSeconds: result.usage?.audioSeconds || recording.durationSeconds, status: 'succeeded' });
  if (process.env.AI_ANALYSIS_ENABLED === 'true') await enqueueJob('ai_analysis', recording._id, `analysis:${recording.id}:${recording.updatedAt.getTime()}`);
}

async function processAnalysis(recording: any) {
  if (!recording.transcript?.text) throw new Error('Transcript is not available');
  const provider = getAIProvider();
  if (!provider.isConfigured()) { recording.analysisStatus = 'not_configured'; await recording.save(); return; }
  recording.analysisStatus = 'processing'; await recording.save();
  const result = await provider.analyzeTranscript(recording.transcript.text);
  const maxConfidence = result.detections.reduce((max, detection) => Math.max(max, detection.confidence), 0);
  const riskScore = Math.round(maxConfidence * 100);
  const riskLevel = riskScore >= 90 ? 'critical' : riskScore >= 75 ? 'high' : riskScore >= 50 ? 'medium' : riskScore > 0 ? 'low' : 'none';
  recording.analysis = { summary: result.summary, topics: result.topics, sentiment: result.sentiment, detections: result.detections, provider: provider.name, model: provider.analysisModel };
  recording.riskScore = riskScore; recording.riskLevel = riskLevel; recording.analysisStatus = 'completed'; await recording.save();
  await Promise.all(result.detections.filter((d) => d.confidence >= Number(process.env.AI_MODERATION_ALERT_THRESHOLD || 0.75)).map((d) => ModerationAlert.findOneAndUpdate(
    { sourceType: 'recording', sourceId: recording._id, category: d.category },
    { $setOnInsert: { sourceType: 'recording', sourceId: recording._id, userId: recording.callerId, hostId: recording.hostId, callId: recording.callId, recordingId: recording._id, category: d.category, confidence: d.confidence, riskLevel: d.confidence >= .9 ? 'critical' : d.confidence >= .75 ? 'high' : 'medium', explanation: d.explanation, evidence: { start: d.start, end: d.end } } },
    { upsert: true, new: true },
  )));
  await AIUsage.create({ provider: provider.name, model: provider.analysisModel, feature: 'recording_analysis', entityType: 'recording', entityId: recording._id, inputTokens: result.usage?.inputTokens || 0, outputTokens: result.usage?.outputTokens || 0, status: 'succeeded' });
  getIOOptional()?.to('admin_recordings').emit('ai-analysis:completed', { recordingId: recording.recordingId, riskLevel, riskScore });
}

async function processRetention() {
  const expired = await CallRecording.find({ retentionDeleteAt: { $lte: new Date() }, status: { $nin: ['deleted', 'expired'] } }).select('+providerState').limit(100);
  for (const recording of expired) {
    if (recording.storage?.key) await deleteRecordingObject(recording.storage.key);
    recording.status = 'expired'; recording.deletedAt = new Date(); recording.deletionReason = 'retention_policy';
    recording.storage = undefined; recording.providerState = undefined; recording.transcript = undefined; recording.analysis = undefined;
    await recording.save();
  }
}

async function tick() {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const job = await ProcessingJob.findOneAndUpdate(
    { $or: [{ status: { $in: ['queued', 'failed'] }, nextRunAt: { $lte: new Date() } }, { status: 'processing', lockedAt: { $lte: staleBefore } }] },
    { $set: { status: 'processing', lockedAt: new Date(), lockedBy: workerId }, $inc: { attempts: 1 } },
    { sort: { nextRunAt: 1, createdAt: 1 }, new: true },
  );
  if (!job) return;
  try {
    const recording = job.entityId ? await CallRecording.findById(job.entityId).select('+providerState') : null;
    if (job.type !== 'retention_cleanup' && !recording) throw new Error('Recording no longer exists');
    if (job.type === 'recording_start') await processStart(recording);
    if (job.type === 'recording_finalize') await processFinalize(recording);
    if (job.type === 'transcription') await processTranscription(recording);
    if (job.type === 'ai_analysis') await processAnalysis(recording);
    if (job.type === 'retention_cleanup') await processRetention();
    job.status = 'completed'; job.completedAt = new Date(); job.lastError = undefined;
  } catch (error: any) {
    job.lastError = String(error?.code || error?.message || 'JOB_FAILED').slice(0, 500);
    job.status = job.attempts >= job.maxAttempts ? 'dead_letter' : 'failed';
    job.nextRunAt = new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 15) * 1000);
    if (job.entityId) await CallRecording.findByIdAndUpdate(job.entityId, { $set: { processingStatus: job.status === 'dead_letter' ? 'failed' : 'queued' } });
  }
  await job.save();
}

export function startRecordingJobWorker() {
  if (timer || process.env.RECORDING_WORKER_ENABLED === 'false') return;
  timer = setInterval(() => void tick().catch((error) => console.error('[recording-worker]', error?.message)), Number(process.env.RECORDING_WORKER_POLL_MS || 5000));
  timer.unref();
  void enqueueJob('retention_cleanup', null, `retention:${new Date().toISOString().slice(0, 10)}`);
}
