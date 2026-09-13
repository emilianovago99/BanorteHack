# BanorteHack

Asistente financiero con 11,602 movimientos sintéticos, herramientas MCP y una interfaz web que cambia con cada pregunta mediante A2UI. Incluye login con Auth0 y voz con ElevenLabs. Consulta gastos por comercio, origen de ingresos, presupuestos, suscripciones y créditos; elige planes de inversión y ajusta sus proyecciones. Todo utiliza un perfil ficticio compartido: `confirm_debt_payment` sólo muta ese dataset demo y no ejecuta movimientos bancarios reales. Ver [arquitectura actual](docs/architecture.md).

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
datasets/synthetic/        CSV reproducible, perfil, créditos y presupuestos
```

## Inicio rápido

Requisitos: Node.js 20.19.4+ (recomendado 22), npm y Python 3.10+; Docker es opcional. Expo SDK 54 usa React Native 0.81 y React 19.1 según su [matriz de compatibilidad](https://docs.expo.dev/versions/v54.0.0/).

Desde la raíz:

```powershell
npm ci
if (-not (Test-Path services/api/.env)) { Copy-Item services/api/.env.example services/api/.env }
if (-not (Test-Path services/ai/.env)) { Copy-Item services/ai/.env.example services/ai/.env }
python -m venv .venv
.\.venv\Scripts\python -m pip install -e "./services/ai[dev]"
```

En macOS/Linux, sustituir `.\.venv\Scripts\python` por `.venv/bin/python`.

Configurar `services/api/.env` con [los pasos de Auth0 y ElevenLabs](docs/auth-and-voice.md), incluidos los Client ID para web y móvil. Para probar únicamente datos ficticios sin login ni voz, usar `AUTH_MODE=demo` en ese archivo.

Ejecutar en tres terminales desde la raíz:

```powershell
# Terminal 1: IA
.\.venv\Scripts\python -m uvicorn app.main:app --app-dir services/ai --env-file services/ai/.env --reload --port 8000
```

```powershell
# Terminal 2: gateway
npm run dev:api
```

```powershell
# Terminal 3: web
npm run dev:web
```

Abrir http://localhost:5173 e iniciar sesión. La documentación de FastAPI está en http://localhost:8000/docs. El botón **Escuchar respuesta** usa ElevenLabs bajo demanda cuando la voz está configurada.

Prueba estas consultas:

- “¿En qué comercios gasté más en agosto de 2026?”
- “¿De dónde vienen mis ingresos?”
- “Busca mis gastos en café en julio de 2025”.
- “Muéstrame mis deudas” y luego **Simular abono de $500**.
- “Quiero invertir $10000”, elige **Equilibrio** y pregunta “¿Y si aporto $2000 al mes?”.

Las acciones generan nuevas superficies con estadísticas y gráficas. Puedes modificar capital, aportación y plazo en el simulador. Ver [flujo A2UI](docs/a2ui.md) y [campos/supuestos del dataset](datasets/synthetic/README.md).

## Móvil

Android incluye login con Auth0 y el catálogo A2UI nativo: gráficas, tarjetas, presupuestos y simuladores. Para un teléfono conectado por USB ejecuta `./scripts/android-usb.ps1`. Consulta [la guía de Android](docs/mobile.md) para compilar, instalar y conectar los servicios.

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

Auth0 y ElevenLabs están conectados al gateway. La configuración pública llega a los clientes desde `/api/config`; las claves permanecen en el servidor. Configura `GEMINI_API_KEY` y `GEMINI_MODEL` en `services/ai/.env` para interpretar preguntas con Gemini. `AI_MODE=local` fuerza el intérprete por reglas para pruebas sin proveedor. Si Gemini falla, el chat conserva consultas y simulaciones mediante el intérprete local.

FastAPI inicia automáticamente su cliente y servidor MCP stdio. Para inspeccionar el servidor de forma independiente:

```powershell
.\.venv\Scripts\python -m app.mcp.server
```

El servidor expone 14 herramientas de consulta, presupuestos, créditos, proyecciones y aclaraciones (`report_query_issue`). Los conectores PostgreSQL/MongoDB y las operaciones con Solana siguen pendientes; las consultas actuales usan SQLite en memoria sobre el CSV incluido. Docker monta ese dataset como solo lectura.

## Verificación

```powershell
npm run typecheck
npm run build
npm test
.\.venv\Scripts\python -m pytest services/ai/tests
npm run test:e2e --workspace @banortehack/web
```

Las pruebas cubren conciliación del CSV, amortización, proyecciones, consultas MCP, acciones A2UI, parámetros inválidos, JWT y audio. Playwright levanta servicios aislados en 8001/3002/5180 y usa Edge en Windows; en otros sistemas instala Chromium con `npx playwright install chromium`. Los recorridos de navegador verifican gráficas, selección de planes, aportaciones desde el chat y adaptación a teléfonos. Las pruebas usan datos locales y no consumen Gemini ni ElevenLabs.

El lockfile de npm fija las dependencias JS; las dependencias Python están acotadas en `pyproject.toml` y se deben bloquear antes de un despliegue reproducible.
