# BanorteHack

Base de un chat financiero para web y móvil, organizada según [Arquitectura.md](docs/Arquitectura.md). Incluye login con Auth0 y voz con ElevenLabs. Los datos financieros siguen siendo ficticios y las operaciones reales están pendientes; consulta el [estado por componente](docs/architecture.md).

```text
apps/
  web/                     React + TypeScript + Vite
  mobile/                  React Native + Expo
packages/
  contracts/               Tipos compartidos de API y visualizaciones
  visual-engine/           Gráficas Chart.js y tablas web
services/
  api/                     Gateway Node.js y capa transaccional
  ai/                      FastAPI, orquestador, Gemini, MCP y datos
infra/
  database/                Esquema PostgreSQL + TimescaleDB
  docker/                  Servicios locales con Docker Compose
  vultr/                   Guía de despliegue futuro
docs/                      Arquitectura y decisiones
```

## Inicio rápido

Requisitos: Node.js 20.19.4+ (recomendado 22), npm y Python 3.10+; Docker es opcional. Expo SDK 54 usa React Native 0.81 y React 19.1 según su [matriz de compatibilidad](https://docs.expo.dev/versions/v54.0.0/).

Desde la raíz:

```powershell
npm ci
if (-not (Test-Path services/api/.env)) { Copy-Item services/api/.env.example services/api/.env }
python -m venv .venv
.\.venv\Scripts\python -m pip install -e "./services/ai[dev]"
```

En macOS/Linux, sustituir `.\.venv\Scripts\python` por `.venv/bin/python`.

Configurar `services/api/.env` con [los pasos de Auth0 y ElevenLabs](docs/auth-and-voice.md), incluidos los Client ID para web y móvil. Para probar únicamente datos ficticios sin login ni voz, usar `AUTH_MODE=demo` en ese archivo.

Ejecutar en tres terminales desde la raíz:

```powershell
# Terminal 1: IA
.\.venv\Scripts\python -m uvicorn app.main:app --app-dir services/ai --reload --port 8000
```

```powershell
# Terminal 2: gateway
npm run dev:api
```

```powershell
# Terminal 3: web
npm run dev:web
```

Abrir http://localhost:5173 e iniciar sesión. La documentación de FastAPI está en http://localhost:8000/docs. El saldo y las series son ficticios; los botones generan vistas previas de 100 MXN y no modifican el saldo. El botón **Escuchar respuesta** usa ElevenLabs bajo demanda cuando la voz está configurada.

## Móvil

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run dev:mobile
```

Para un teléfono físico, configurar `EXPO_PUBLIC_API_URL` con la IP LAN de la computadora y `HOST=0.0.0.0` en `services/api/.env` para permitir la conexión desde la red local. En el emulador Android, usar `http://10.0.2.2:3001`. El login requiere un **development build** con el esquema `banortehack`; reconstruirlo con `npm run android --workspace @banortehack/mobile`. Expo Go no soporta este callback propio. Ver [configuración móvil](docs/auth-and-voice.md).

## Docker y datos

```powershell
# Backend completo y bases de datos; ejecutar la web con npm run dev:web
docker compose -f infra/docker/compose.yml up --build -d
```

También se pueden iniciar solo las bases con `docker compose -f infra/docker/compose.yml up -d postgres mongo`. La demo no consulta todavía esas bases. El SQL inicial solo se aplica cuando el volumen PostgreSQL está vacío. Las credenciales del Compose son únicamente para desarrollo local.

## Configuración e integraciones

Cada servicio incluye `.env.example`; no subir archivos `.env`. Node carga `services/api/.env`. FastAPI carga `.env` desde el directorio de ejecución; para usar `services/ai/.env` desde la raíz, agregar `--env-file services/ai/.env` al comando de Uvicorn.

Auth0 y ElevenLabs están conectados al gateway. La configuración pública llega a los clientes desde `/api/config`; las claves permanecen en el servidor. Las dependencias opcionales de IA y el servidor MCP se habilitan así:

```powershell
.\.venv\Scripts\python -m pip install -e "./services/ai[integrations]"
.\.venv\Scripts\python -m app.mcp.server
```

El servidor MCP usa stdio y expone `get_financial_summary` con datos demo. Los conectores Gemini, PostgreSQL y MongoDB son puntos de partida; AES y Solana siguen pendientes.

## Verificación

```powershell
npm run typecheck
npm run build
npm test
.\.venv\Scripts\python -m pytest services/ai/tests
```

Las pruebas cubren clasificación, validación de mensajes/montos, indisponibilidad de IA, bloqueo de ejecución real, JWT inválidos, rutas protegidas y audio con proveedor simulado. El lockfile de npm fija las dependencias JS; las dependencias Python están acotadas en `pyproject.toml` y se deben bloquear antes de un despliegue reproducible.
