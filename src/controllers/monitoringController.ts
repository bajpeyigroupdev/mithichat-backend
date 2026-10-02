import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session.model';
import { ProcessingJob } from '../models/processingJob.model';
import redis from '../configs/redisConfig';
import { checkRecordingStorageHealth } from '../services/recordingStorage.service';
import { getAIProvider } from '../services/aiProvider';
import { getCallRecordingProvider } from '../services/callRecordingProvider';
import sendResponse from '../utils/reponse';

export const getSystemHealth = async (_req: Request, res: Response) => {
  try {
    const started = Date.now();
    const dbState = mongoose.connection.readyState;
    const [activeSessions, queue, storage, redisResult] = await Promise.all([
      Session.countDocuments({ isActive: true }),
      ProcessingJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      checkRecordingStorageHealth(),
      redis.ping().then(() => ({ status: 'healthy' as const })).catch((error: any) => ({ status: 'unhealthy' as const, error: error?.code || 'REDIS_UNAVAILABLE' })),
    ]);
    const aiProvider = getAIProvider();
    const recordingProvider = getCallRecordingProvider();
    const dependencies = {
      database: { status: dbState === 1 ? 'healthy' : 'unhealthy' },
      redis: redisResult,
      recordingStorage: storage,
      aiProvider: { status: aiProvider.isConfigured() ? 'configured' : 'not_configured', provider: aiProvider.name, analysisModel: aiProvider.analysisModel, transcriptionModel: aiProvider.transcriptionModel },
      callingProvider: { status: process.env.AGORA_APP_ID ? 'configured' : 'not_configured', provider: 'agora' },
      recordingProvider: { status: recordingProvider.isConfigured() ? 'configured' : 'not_configured', provider: recordingProvider.name },
    };
    const unhealthy = Object.values(dependencies).some((item) => item.status === 'unhealthy');
    const healthData = {
      status: unhealthy ? 'DEGRADED' : 'HEALTHY', uptimeSeconds: Math.floor(process.uptime()), timestamp: new Date(),
      dependencies,
      queue: Object.fromEntries(queue.map((row) => [String(row._id), row.count])),
      server: { nodeVersion: process.version, platform: process.platform, memoryRssMb: Number((process.memoryUsage().rss / 1048576).toFixed(2)), heapUsedMb: Number((process.memoryUsage().heapUsed / 1048576).toFixed(2)) },
      metrics: { activeSessions, measuredApiLatencyMs: Date.now() - started },
    };
    return sendResponse(res, unhealthy ? 503 : 200, true, 'System health metrics retrieved', healthData);
  } catch {
    return sendResponse(res, 500, false, 'Failed to retrieve system health metrics');
  }
};
