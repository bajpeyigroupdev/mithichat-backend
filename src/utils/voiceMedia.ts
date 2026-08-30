const NON_AUDIO_EXTENSIONS = /.(?:pdf|png|jpe?g|webp|gif|svg|docx?|xlsx?|pptx?)(?:$|[?#])/i;

export const isPlayableVoiceUrl = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const url = value.trim();
    return url.length > 0 && !NON_AUDIO_EXTENSIONS.test(url);
};

export const firstPlayableVoiceUrl = (...values: unknown[]): string => {
    const match = values.find(isPlayableVoiceUrl);
    return typeof match === 'string' ? match.trim() : '';
};