# Integraciones del gateway

- **ElevenLabs:** `elevenlabs.js` genera MP3 desde `POST /api/speech`, con credenciales solo en servidor, límite por usuario y errores sanitizados. Web y móvil incluyen reproducción.
- **OAuth2 / Auth0:** `oauth.js` valida access tokens RS256 con JWKS, issuer, audience y expiración. El gateway obtiene `sub` del token; la autorización sobre recursos de usuarios reales está pendiente porque todos los datos financieros siguen siendo ficticios.
- **Solana / REST bancario:** implementar adaptadores en `../transactions`. Actualmente solo existe una vista previa; `POST /api/transactions` devuelve 501. Pendientes confirmación explícita, firma por wallet, idempotencia y conciliación antes de habilitar movimientos.

Las claves privadas y secretos pertenecen al servidor o al gestor de secretos, nunca a variables `EXPO_PUBLIC_*` ni al bundle web.

Consultar [configuración de Auth0 y voz](../../../../docs/auth-and-voice.md).
