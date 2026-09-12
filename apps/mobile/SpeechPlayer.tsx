import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useSession } from './session';

export function SpeechPlayer({ text }: { text: string }) {
  const { request } = useSession();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const file = useRef<File | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => {
    pending.current?.abort();
    try { if (file.current?.exists) file.current.delete(); } catch { /* El SO podrá limpiar la caché. */ }
  }, []);

  async function listen() {
    if (pending.current) return;
    setError('');
    if (ready) {
      try {
        if (status.playing) player.pause();
        else { await player.seekTo(0); player.play(); }
      } catch { setError('No se pudo reproducir el audio.'); }
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const response = await request('/api/speech', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal
      });
      const data = new Uint8Array(await response.arrayBuffer());
      if (controller.signal.aborted) return;
      const audioFile = new File(Paths.cache, `speech-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
      file.current = audioFile;
      audioFile.create();
      audioFile.write(data);
      player.replace(audioFile.uri);
      setReady(true);
      player.play();
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudo generar el audio.');
    } finally { pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <View style={{ gap: 8 }}>
    <Button title={busy ? 'Generando voz…' : status.playing ? 'Pausar' : ready ? 'Volver a escuchar' : 'Escuchar respuesta'} disabled={busy} onPress={listen} />
    {Boolean(error) && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}
