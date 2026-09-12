# Integraciones del gateway

- **ElevenLabs:** agregar adaptador de síntesis de voz en el servidor usando `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID`. Pendientes endpoint de audio y reproducción en los clientes.
- **OAuth2:** implementar verificación de tokens del emisor configurado, audiencia y permisos; obtener el identificador del usuario del token validado. La demo actual no autentica usuarios ni maneja datos reales.
- **Solana / REST bancario:** implementar adaptadores en `../transactions`. Actualmente solo existe una vista previa; `POST /api/transactions` devuelve 501. Pendientes confirmación explícita, firma por wallet, idempotencia y conciliación antes de habilitar movimientos.

Las claves privadas y secretos pertenecen al servidor o al gestor de secretos, nunca a variables `EXPO_PUBLIC_*` ni al bundle web.
