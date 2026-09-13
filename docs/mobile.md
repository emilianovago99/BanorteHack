# Android: login, chat y A2UI nativos

La app Expo usa componentes React Native y gráficas SVG; no carga la web en un WebView. Comparte el validador de mensajes A2UI con la web mediante `@banortehack/visual-engine/protocol`, sin importar Chart.js ni elementos DOM en Android.

Soporta todo el catálogo financiero actual: indicadores, tablas con desplazamiento horizontal, gráficas de barras/líneas/dona y sus datos accesibles, presupuestos, metas, tarjetas de planes y deudas, formularios de simulación y botones A2UI. Las acciones y preguntas posteriores consultan los mismos endpoints que la web. Las paletas cambian por dominio y el estado inicial ofrece tres ejemplos debajo del input.

## Probar por USB en Windows

1. Activa depuración USB en Android, conecta el teléfono y acepta la autorización de esta computadora.
2. Conserva `EXPO_PUBLIC_API_URL=http://localhost:3001` en `apps/mobile/.env`.
3. Desde la raíz ejecuta `./scripts/android-usb.ps1` para redirigir los puertos 3001 y 8081 al teléfono.
4. Inicia los servicios de API e IA con los comandos del README y Metro con `npm run dev:mobile`.
5. Compila e instala con `npm run android --workspace @banortehack/mobile` y selecciona tu teléfono. Requiere Android Studio/SDK y JDK 17 o una versión compatible instalada con Android Studio. La primera compilación descarga Gradle, NDK y dependencias.
6. Abre BanorteHack, pulsa **Iniciar sesión** y completa Auth0 en el navegador. Volverás a la app mediante `banortehack://auth/callback`.

El APK de desarrollo generado está en `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Depende de Metro; no es una distribución de producción. Los proyectos nativos generados se ignoran en Git y se recrean desde la configuración de Expo.

Para conexión por Wi-Fi usa la IP LAN de la computadora en `EXPO_PUBLIC_API_URL`, la misma red en ambos dispositivos y `HOST=0.0.0.0` en la API. Reinicia la API y Metro al cambiar sus variables. Por USB se puede mantener la API en `127.0.0.1`.

## Auth0 y Gemini

Usa `AUTH_MODE=required` en la API y el Client ID **Native** en `OAUTH_MOBILE_CLIENT_ID`. Registra `banortehack://auth/callback` como callback y logout permitido de esa aplicación en Auth0. La app usa Authorization Code con PKCE y nunca incluye Client Secret. Los tokens se mantienen en memoria; reiniciar la app requiere una sesión nueva. Ver [Auth0](auth-and-voice.md).

`AI_MODE=gemini` en el servicio de IA exige la interpretación de Gemini. Si falta clave, hay un error o se agota la cuota, el chat responde mediante la herramienta MCP `report_query_issue`; no presenta respuestas locales como si vinieran del modelo. `AI_MODE=local` es para pruebas reproducibles sin consumo y `auto` permite respaldo local, salvo cuota agotada que se comunica explícitamente.

Prueba “Quiero invertir $10000”, selecciona Equilibrio, cambia la aportación y envía “¿Y si aporto $2000 al mes?”. También prueba texto sin sentido: debe aparecer una aclaración, sin estadísticas inventadas. Todos los datos son sintéticos; la confirmación de abonos sólo modifica el perfil de demostración.

El callback propio necesita una compilación nativa; [Expo Go no permite probar este flujo OAuth](https://docs.expo.dev/guides/authentication/).
