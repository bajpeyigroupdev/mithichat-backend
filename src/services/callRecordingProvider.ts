import axios, { AxiosInstance } from 'axios';
import { getRecordingStorageConfig } from './recordingStorage.service';

export interface StartRecordingInput {
  channelName: string;
  recordingId: string;
  recorderUid: string;
  token: string;
  callType: 'voice' | 'video' | 'room';
}

export interface RecordingProviderSession {
  resourceId: string;
  sessionId: string;
  recorderUid: string;
}

export interface CallRecordingProvider {
  readonly name: string;
  isConfigured(): boolean;
  start(input: StartRecordingInput): Promise<RecordingProviderSession>;
  stop(input: { channelName: string; resourceId: string; sessionId: string; recorderUid: string }): Promise<{ files: Array<{ key: string }> }>;
  status(input: { resourceId: string; sessionId: string }): Promise<unknown>;
}

class AgoraCloudRecordingProvider implements CallRecordingProvider {
  readonly name = 'agora';

  private client(): AxiosInstance {
    const customerId = process.env.AGORA_CUSTOMER_ID?.trim();
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET?.trim();
    if (!customerId || !customerSecret) throw Object.assign(new Error('Agora Cloud Recording is not configured'), { code: 'PROVIDER_NOT_CONFIGURED' });
    return axios.create({
      baseURL: 'https://api.agora.io/v1',
      timeout: 15_000,
      auth: { username: customerId, password: customerSecret },
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private appId() {
    const appId = process.env.AGORA_APP_ID?.trim();
    if (!appId) throw Object.assign(new Error('Agora App ID is not configured for recording'), { code: 'PROVIDER_NOT_CONFIGURED' });
    return appId;
  }

  isConfigured() {
    return Boolean(process.env.AGORA_APP_ID && process.env.AGORA_CUSTOMER_ID && process.env.AGORA_CUSTOMER_SECRET && getRecordingStorageConfig());
  }

  async start(input: StartRecordingInput): Promise<RecordingProviderSession> {
    const storage = getRecordingStorageConfig();
    if (!storage) throw Object.assign(new Error('Recording storage is not configured'), { code: 'STORAGE_NOT_CONFIGURED' });
    const appId = this.appId();
    const client = this.client();
    const acquire = await client.post(`/apps/${appId}/cloud_recording/acquire`, {
      cname: input.channelName,
      uid: input.recorderUid,
      clientRequest: { resourceExpiredHour: 24 },
    });
    const resourceId = acquire.data?.resourceId;
    if (!resourceId) throw new Error('Agora did not return a recording resource ID');

    const vendor = Number(process.env.AGORA_RECORDING_STORAGE_VENDOR || 1);
    const fileType = input.callType === 'voice' ? ['hls'] : ['hls'];
    const start = await client.post(`/apps/${appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`, {
      cname: input.channelName,
      uid: input.recorderUid,
      clientRequest: {
        token: input.token,
        recordingConfig: {
          channelType: 0,
          streamTypes: input.callType === 'voice' ? 0 : 2,
          audioProfile: 1,
          maxIdleTime: 30,
        },
        recordingFileConfig: { avFileType: fileType },
        storageConfig: {
          vendor,
          region: Number(process.env.AGORA_RECORDING_STORAGE_REGION_CODE || 0),
          bucket: storage.bucket,
          accessKey: storage.accessKeyId,
          secretKey: storage.secretAccessKey,
          fileNamePrefix: ['recordings', input.recordingId],
        },
      },
    });
    const sessionId = start.data?.sid;
    if (!sessionId) throw new Error('Agora did not return a recording session ID');
    return { resourceId, sessionId, recorderUid: input.recorderUid };
  }

  async stop(input: { channelName: string; resourceId: string; sessionId: string; recorderUid: string }) {
    const appId = this.appId();
    const response = await this.client().post(
      `/apps/${appId}/cloud_recording/resourceid/${input.resourceId}/sid/${input.sessionId}/mode/mix/stop`,
      { cname: input.channelName, uid: input.recorderUid, clientRequest: {} },
    );
    const fileList = response.data?.serverResponse?.fileList;
    const files = Array.isArray(fileList)
      ? fileList.map((file: any) => ({ key: String(file?.fileName || '') })).filter((file: { key: string }) => file.key)
      : [];
    return { files };
  }

  async status(input: { resourceId: string; sessionId: string }) {
    return (await this.client().get(`/apps/${this.appId()}/cloud_recording/resourceid/${input.resourceId}/sid/${input.sessionId}/mode/mix/query`)).data;
  }
}

const providers: Record<string, CallRecordingProvider> = { agora: new AgoraCloudRecordingProvider() };
export function getCallRecordingProvider(name = process.env.CALL_RECORDING_PROVIDER || 'agora') {
  const provider = providers[name];
  if (!provider) throw Object.assign(new Error(`Unsupported recording provider: ${name}`), { code: 'UNSUPPORTED_PROVIDER' });
  return provider;
}
