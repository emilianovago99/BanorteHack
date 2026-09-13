# Autenticación y voz

La API valida access tokens de Auth0 con firma RS256, JWKS remoto, issuer, audience, sujeto y expiración. Web usa el SDK de Auth0 (Authorization Code + PKCE) y móvil usa Expo AuthSession con PKCE. Los tokens se mantienen en memoria, no en archivos ni localStorage; en móvil se pide iniciar sesión de nuevo al reiniciar o vencer el token.

## Configurar Auth0

En Auth0, registrar una API con su **Identifier** como `OAUTH_AUDIENCE` y algoritmo de firma **RS256**. El Identifier identifica la API y no es el Client ID de una aplicación.

En **Applications → Applications → Create Application**, crear:

| Configuración | Web | Móvil |
| --- | --- | --- |
| Tipo de aplicación | Single Page Application | Native |
| Nombre sugerido | Lazy Bank Web | Lazy Bank Mobile |
| Allowed Callback URLs | `http://localhost:5173` | `lazy-bank://auth/callback` |
| Allowed Logout URLs | `http://localhost:5173` | `lazy-bank://auth/callback` |
| Allowed Web Origins | `http://localhost:5173` | No requerido para la app nativa |
| Variable para el Client ID de Settings | `OAUTH_WEB_CLIENT_ID` | `OAUTH_MOBILE_CLIENT_ID` |

Guardar los cambios. Ambas aplicaciones son clientes públicos: usar Authorization Code con PKCE y autenticación del token endpoint **None**; nunca agregar Client Secret al cliente. Si la API restringe qué aplicaciones pueden solicitar tokens, autorizar ambas aplicaciones para esa API. El login web solicita `openid profile email` y la audiencia configurada.

Si Auth0 devuelve `Client is not authorized to access resource server`, abrir **Applications → APIs → tu API → Application Access**. En **Lazy Bank Web → Edit**, seleccionar **Grant Access** para **User-Delegated Access** y guardar; repetir para **Lazy Bank Mobile**. Si el acceso está deshabilitado para todas las apps, en **Settings → Application Access Policy** establecer **User-Delegated Access → Per-app authorization** y después otorgar esos accesos individuales. Este login no requiere habilitar Client Credentials ni acceso Machine-to-Machine. Volver a `http://localhost:5173` sin los parámetros del error y reintentar el login.

En `services/api/.env`:

```dotenv
AUTH_MODE=required
OAUTH_ISSUER=https://TU-TENANT.us.auth0.com/
OAUTH_AUDIENCE=https://lazy-bank-api
OAUTH_WEB_CLIENT_ID=CLIENT_ID_WEB
OAUTH_MOBILE_CLIENT_ID=CLIENT_ID_NATIVE
ELEVENLABS_API_KEY=CLAVE_PRIVADA
ELEVENLABS_VOICE_ID=ID_DE_LA_VOZ
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Usar el `issuer` que publica `https://TU-TENANT.us.auth0.com/.well-known/openid-configuration`. También se acepta el dominio de Auth0 sin `https://`: la API lo normaliza a una URL con barra final. Reiniciar la API tras cambiar `.env` y recargar los clientes. `GET /api/config` expone exclusivamente configuración pública y disponibilidad de voz; nunca claves de ElevenLabs.

Para usar la app nativa, reconstruir un **development build** con el esquema `lazy-bank` (`npm run android --workspace @lazy-bank/mobile` o el equivalente iOS en macOS). Expo Go no sirve para probar este callback propio. Mantener `EXPO_PUBLIC_API_URL` apuntando a la API accesible por el teléfono.

## Nombre e íconos de la app

El nombre visible es **LazyBank**. El logo vectorial está en `apps/web/public/lazybank.svg`; los PNG para navegador, iPhone y Android se regeneran en Windows con `./scripts/generate-branding.ps1`.

Si el celular conserva el nombre o ícono anterior, sincronizar el proyecto nativo generado y volver a compilar e instalar (recargar Metro no actualiza estos recursos):

```powershell
cd apps/mobile
npx expo prebuild --platform android --no-install
npm run android
```

La app actual usa el paquete `com.lazybank.demo`. Una instalación antigua con el paquete `com.banortehack.demo` puede seguir apareciendo como una app separada. En iOS, regenerar y compilar en macOS. Para un acceso web guardado en la pantalla de inicio, volver a agregarlo para que tome el nombre y el ícono nuevos.

## Voz

La voz está desactivada en el celular mediante `MOBILE_VOICE_ENABLED = false` en `apps/mobile/features.ts`. El reproductor y la integración quedan preparados; no se muestra el control ni se solicita audio. Su activación futura requiere cambiar esa bandera y que la API publique voz disponible.

## Confirmación y saldo de demostración

Explorar planes o actualizar simulaciones no modifica el saldo. Al confirmar una inversión se descuenta el capital inicial del saldo disponible y se suma a las inversiones; los rendimientos y aportaciones futuras de la proyección no se depositan. Al confirmar un abono se descuentan el saldo disponible y la deuda.

El móvil pide confirmar el monto antes de registrar el movimiento. Web y móvil consultan nuevamente la cuenta tras una confirmación y al volver al inicio o reactivar la app, para mostrar el saldo vigente. Los reintentos de una misma confirmación conservan su folio; una operación nueva, aunque tenga el mismo monto, genera otro movimiento. Los movimientos siguen siendo del perfil sintético compartido.

### Servicio de voz

La clave necesita permiso **Text to Speech** y acceso a la voz elegida. Después del login y de enviar un mensaje, pulsar **Escuchar respuesta**: la API genera un MP3 con ElevenLabs y el cliente lo reproduce. No se genera audio automáticamente al recibir mensajes.

- Endpoint: `POST /api/speech` con Bearer token y JSON `{ "text": "Hola" }`.
- Máximo 2000 caracteres y 5 solicitudes por minuto por usuario y por instancia del servidor.
- La respuesta no se almacena en cachés HTTP. Web usa un object URL temporal; móvil guarda un archivo en caché que elimina al desmontar el reproductor (si el proceso termina abruptamente, puede permanecer hasta que el SO limpie la caché).
- La repetición del audio ya descargado no vuelve a llamar a ElevenLabs.
- Los errores de credenciales, cuota, conexión y expiración se presentan sin incluir secretos.

Comprobar discovery de Auth0 y acceso a la voz, sin sintetizar audio ni consumir créditos de TTS:

```powershell
npm run check:integrations --workspace @lazy-bank/api
```

Esta consulta de voz requiere también permiso **Voices Read**. Un 401/403 en esta comprobación puede indicar permisos insuficientes; no prueba por sí solo que Text to Speech esté deshabilitado. No valida el login interactivo ni la configuración de callbacks.

## Modo demo y alcance

`AUTH_MODE=required` es el valor por defecto. Sin issuer/audience válidos, la API no inicia. Para trabajar únicamente con datos ficticios sin cuentas externas, configurar explícitamente `AUTH_MODE=demo`: no exige sesión y deshabilita toda generación de voz, incluso si hay una clave en `.env`.

Solo `/health`, `/api/config` y las solicitudes CORS preflight son públicas. Saldo, chat, vistas previas, voz y el endpoint transaccional requieren token cuando la autenticación está activa. Las transacciones reales siguen sin implementarse. Los datos continúan siendo ficticios y compartidos; la persistencia y autorización de recursos financieros por usuario siguen pendientes. FastAPI es un servicio interno, no debe exponerse públicamente para saltarse el gateway.

Antes de escalar a varias instancias, compartir el contador de voz en una base de datos o Redis. Las pruebas usan tokens firmados localmente y respuestas de voz simuladas, sin gastar créditos ni requerir secretos en CI.

Referencias: [Auth0 React](https://auth0.com/docs/quickstart/spa/react), [Expo AuthSession](https://docs.expo.dev/guides/authentication/), [jose](https://github.com/panva/jose), [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
