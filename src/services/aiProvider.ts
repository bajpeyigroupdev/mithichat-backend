import axios from 'axios';

export interface AIAnalysisResult {
  summary: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  detections: Array<{ category: string; confidence: number; explanation: string; start?: number; end?: number }>;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AIProvider {
  readonly name: string;
  readonly analysisModel: string;
  readonly transcriptionModel: string;
  isConfigured(): boolean;
  transcribeMedia(mediaUrl: string, filename: string): Promise<{ text: string; language?: string; segments: Array<{ start: number; end: number; speaker?: string; text: string }>; usage?: { inputTokens?: number; outputTokens?: number; audioSeconds?: number } }>;
  analyzeTranscript(transcript: string): Promise<AIAnalysisResult>;
}

class OpenAICompatibleProvider implements AIProvider {
  readonly name = process.env.AI_PROVIDER || 'openai';
  readonly analysisModel = process.env.AI_ANALYSIS_MODEL || 'gpt-5-mini';
  readonly transcriptionModel = process.env.AI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

  isConfigured() { return Boolean(process.env.AI_API_KEY); }

  async transcribeMedia(mediaUrl: string, filename: string) {
    if (!this.isConfigured()) throw Object.assign(new Error('AI provider is not configured'), { code: 'AI_NOT_CONFIGURED' });
    const media = await axios.get<ArrayBuffer>(mediaUrl, { responseType: 'arraybuffer', timeout: 120_000, maxContentLength: Number(process.env.AI_MAX_MEDIA_BYTES || 524288000) });
    const form = new FormData();
    form.append('file', new Blob([media.data]), filename);
    form.append('model', this.transcriptionModel);
    form.append('response_format', this.transcriptionModel.includes('diarize') ? 'diarized_json' : 'verbose_json');
    if (this.transcriptionModel.includes('diarize')) form.append('chunking_strategy', 'auto');
    const baseURL = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await axios.post(`${baseURL}/audio/transcriptions`, form, { timeout: 300_000, headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` } });
    return {
      text: String(response.data?.text || ''), language: response.data?.language,
      segments: Array.isArray(response.data?.segments) ? response.data.segments.map((segment: any) => ({ start: Number(segment.start || 0), end: Number(segment.end || 0), speaker: segment.speaker ? String(segment.speaker) : undefined, text: String(segment.text || '') })) : [],
      usage: { inputTokens: response.data?.usage?.input_tokens, outputTokens: response.data?.usage?.output_tokens, audioSeconds: response.data?.usage?.seconds || response.data?.duration },
    };
  }

  async analyzeTranscript(transcript: string): Promise<AIAnalysisResult> {
    if (!this.isConfigured()) throw Object.assign(new Error('AI provider is not configured'), { code: 'AI_NOT_CONFIGURED' });
    const baseURL = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const schemaInstruction = `Return only JSON with summary:string, topics:string[], sentiment:positive|neutral|negative|mixed, detections:{category:string,confidence:number,explanation:string,start?:number,end?:number}[]. Treat detections as leads for human review, never confirmed facts.`;
    const response = await axios.post(`${baseURL}/responses`, {
      model: this.analysisModel,
      store: false,
      input: [
        { role: 'system', content: `${schemaInstruction} Detect abuse, harassment, threats, scams, fraud, sexual content, hate/violence, extortion, spam, manipulation, and suspicious payment requests.` },
        { role: 'user', content: transcript.slice(0, Number(process.env.AI_MAX_TRANSCRIPT_CHARS || 120000)) },
      ],
      text: { format: { type: 'json_object' } },
    }, {
      timeout: 60_000,
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' },
    });
    const outputText = response.data?.output_text || response.data?.output?.flatMap((item: any) => item.content || []).find((c: any) => c.type === 'output_text')?.text;
    if (!outputText) throw new Error('AI provider returned no analysis output');
    const parsed = JSON.parse(outputText);
    return {
      summary: String(parsed.summary || ''),
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(String).slice(0, 20) : [],
      sentiment: ['positive', 'neutral', 'negative', 'mixed'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      detections: Array.isArray(parsed.detections) ? parsed.detections.slice(0, 50).map((d: any) => ({
        category: String(d.category || 'other'), confidence: Math.min(1, Math.max(0, Number(d.confidence || 0))), explanation: String(d.explanation || ''),
        ...(Number.isFinite(d.start) ? { start: Number(d.start) } : {}), ...(Number.isFinite(d.end) ? { end: Number(d.end) } : {}),
      })) : [],
      usage: { inputTokens: response.data?.usage?.input_tokens, outputTokens: response.data?.usage?.output_tokens },
    };
  }
}

const provider = new OpenAICompatibleProvider();
export function getAIProvider(): AIProvider { return provider; }
