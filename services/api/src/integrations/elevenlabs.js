export class SpeechError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createSpeechService(config, { fetchImpl = fetch } = {}) {
  return async text => {
    if (!config.elevenLabsKey || !config.voiceId) throw new SpeechError(503, 'La voz aún no está disponible.');
    try {
      const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'xi-api-key': config.elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: config.voiceModel })
      });
      if (response.status === 429) throw new SpeechError(429, 'El servicio de voz está ocupado o alcanzó su límite. Intenta más tarde.');
      if (!response.ok) throw new SpeechError(502, 'No se pudo generar la voz.');
      if (!response.headers.get('content-type')?.includes('audio/')) throw new SpeechError(502, 'El servicio no devolvió audio válido.');
      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length || audio.length > 10_000_000) throw new SpeechError(502, 'El audio recibido no es válido.');
      return audio;
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      throw new SpeechError(502, 'El servicio de voz no está disponible.');
    }
  };
}

// Límite por usuario, en memoria y por instancia. Compartir almacenamiento al escalar.
export function createSpeechLimiter({ now = Date.now, limit = 5, windowMs = 60_000 } = {}) {
  const users = new Map();
  return subject => {
    const time = now();
    for (const [key, entry] of users) if (entry.until <= time) users.delete(key);
    const entry = users.get(subject) ?? { count: 0, until: time + windowMs };
    if (entry.count >= limit) return false;
    entry.count += 1;
    users.set(subject, entry);
    return true;
  };
}
