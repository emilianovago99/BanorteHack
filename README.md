# BanorteHack

Base de un chat financiero para web y móvil, organizada según [Arquitectura.md](docs/Arquitectura.md). Incluye una demo local con datos ficticios. Las integraciones externas y las operaciones financieras reales están pendientes; consulta el [estado por componente](docs/architecture.md).

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
python -m venv .venv
.\.venv\Scripts\python -m pip install -e "./services/ai[dev]"
```

En macOS/Linux, sustituir `.\.venv\Scripts\python` por `.venv/bin/python`.

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

Abrir http://localhost:5173. La documentación de FastAPI está en http://localhost:8000/docs. El saldo y las series son ficticios; los botones generan vistas previas de 100 MXN y no modifican el saldo.

## Móvil

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run dev:mobile
```

Para un teléfono físico, configurar `EXPO_PUBLIC_API_URL` con la IP LAN de la computadora. Copiar `services/api/.env.example` a `services/api/.env` y cambiar `HOST=0.0.0.0` para permitir la conexión desde la red local. En el emulador Android, usar `http://10.0.2.2:3001`. Usar un development build o una versión de Expo Go compatible con SDK 54; la versión actual de Expo Go puede requerir un SDK más nuevo.

## Docker y datos

```powershell
# Backend completo y bases de datos; ejecutar la web con npm run dev:web
docker compose -f infra/docker/compose.yml up --build -d
```

También se pueden iniciar solo las bases con `docker compose -f infra/docker/compose.yml up -d postgres mongo`. La demo no consulta todavía esas bases. El SQL inicial solo se aplica cuando el volumen PostgreSQL está vacío. Las credenciales del Compose son únicamente para desarrollo local.

## Configuración e integraciones

Cada servicio incluye `.env.example`; no subir archivos `.env`. Node carga `services/api/.env`. FastAPI carga `.env` desde el directorio de ejecución; para usar `services/ai/.env` desde la raíz, agregar `--env-file services/ai/.env` al comando de Uvicorn.

Las dependencias opcionales y el servidor MCP se habilitan así:

```powershell
.\.venv\Scripts\python -m pip install -e "./services/ai[integrations]"
.\.venv\Scripts\python -m app.mcp.server
```

El servidor MCP usa stdio y expone `get_financial_summary` con datos demo. Los conectores Gemini, PostgreSQL y MongoDB son puntos de partida; ElevenLabs, OAuth2, AES y Solana están documentados como trabajo pendiente.

## Verificación

```powershell
npm run typecheck
npm run build
npm test
.\.venv\Scripts\python -m pytest services/ai/tests
```

Las pruebas cubren clasificación, validación de mensajes/montos, indisponibilidad de IA y bloqueo de ejecución real. El lockfile de npm fija las dependencias JS; las dependencias Python están acotadas en `pyproject.toml` y se deben bloquear antes de un despliegue reproducible.
