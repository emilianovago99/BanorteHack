import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';

export function SpeechPlayer({ text }: { text: string }) {
  const { request } = useSession();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function listen() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await request('/api/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal
      });
      const blob = await response.blob();
      if (!controller.signal.aborted) setUrl(URL.createObjectURL(blob));
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudo generar el audio.');
    } finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  return <div className="speech">
    {!url && <button className="secondary" disabled={busy} onClick={listen}>{busy ? 'Generando voz…' : 'Escuchar respuesta'}</button>}
    {url && <audio aria-label="Respuesta del asistente" controls autoPlay src={url} onError={() => setError('No se pudo reproducir el audio.')} />}
    {error && <p role="alert">{error}</p>}
  </div>;
}
