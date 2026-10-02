import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface RecordingStorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function getRecordingStorageConfig(): RecordingStorageConfig | null {
  const bucket = process.env.RECORDING_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.RECORDING_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.RECORDING_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint: process.env.RECORDING_STORAGE_ENDPOINT?.trim() || undefined,
    region: process.env.RECORDING_STORAGE_REGION?.trim() || 'ap-south-1',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.RECORDING_STORAGE_FORCE_PATH_STYLE === 'true',
  };
}

function createClient(config: RecordingStorageConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export async function createRecordingPlaybackUrl(key: string, expiresInSeconds = 300) {
  const config = getRecordingStorageConfig();
  if (!config) throw Object.assign(new Error('Recording storage is not configured'), { code: 'STORAGE_NOT_CONFIGURED' });
  const safeExpiry = Math.min(900, Math.max(30, Math.floor(expiresInSeconds)));
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
  });
  return getSignedUrl(createClient(config), command, { expiresIn: safeExpiry });
}

export async function deleteRecordingObject(key: string) {
  const config = getRecordingStorageConfig();
  if (!config) throw Object.assign(new Error('Recording storage is not configured'), { code: 'STORAGE_NOT_CONFIGURED' });
  await createClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function checkRecordingStorageHealth() {
  const config = getRecordingStorageConfig();
  if (!config) return { status: 'not_configured' as const };
  try {
    await createClient(config).send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { status: 'healthy' as const, provider: config.endpoint ? 's3-compatible' : 'aws-s3', region: config.region };
  } catch (error: any) {
    return { status: 'unhealthy' as const, error: error?.name || 'STORAGE_UNAVAILABLE' };
  }
}
