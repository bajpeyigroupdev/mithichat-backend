export interface TraceContext {
    traceId: string;
    spanId: string;
    serviceName: string;
}

export function generateTraceId(): string {
    return `tr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function logTrace(level: 'INFO' | 'WARN' | 'ERROR', message: string, traceCtx?: Partial<TraceContext>, metadata: Record<string, any> = {}) {
    const traceId = traceCtx?.traceId || generateTraceId();
    const spanId = traceCtx?.spanId || `sp_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();

    const structuredLog = {
        timestamp,
        level,
        service: traceCtx?.serviceName || 'EnterpriseEngine',
        traceId,
        spanId,
        message,
        ...metadata
    };

    console.log(`[APM TRACE] ${JSON.stringify(structuredLog)}`);
}
