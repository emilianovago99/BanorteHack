# Despliegue en Vultr

Directorio reservado para infraestructura de despliegue. No se crea ningún recurso cloud desde esta plantilla.

La demo puede ejecutarse en una VM con Docker usando `infra/docker/compose.yml` y servir el build `apps/web/dist` con un proxy que enrute `/api` al puerto 3001. El Compose incluido es exclusivamente de desarrollo local.

Antes de un despliegue público se deben definir dominio/TLS, gestión de secretos, proveedor OAuth2, persistencia y respaldos, límites de solicitudes y observabilidad. Fijar imágenes por versión o digest y sustituir las credenciales locales. La GPU es opcional; la demo no la necesita.
