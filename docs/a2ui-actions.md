# Auditoría contextual de acciones A2UI

packages/contracts/src/a2ui.ts es la fuente de los esquemas Zod. npm run contracts:generate
produce packages/visual-engine/catalog.json y services/ai/app/a2ui_contract.json.
El segundo archivo se incluye en la distribución Python; no depende de encontrar el monorepo
en producción. Pydantic valida las superficies y los contextos mediante este mismo JSON Schema.
npm test comprueba que ambos artefactos estén actualizados antes de ejecutar las pruebas.
Los scripts usan el soporte nativo de TypeScript de Node 22.18 o posterior.

## Regla contextual

Las gráficas, tablas, métricas, metas y presupuestos informativos no requieren una acción.
DebtCard y PlanCard sí requieren transactionalAction, con etiqueta, efecto y evento:

    {
      "transactionalAction": {
        "label": "Confirmar abono único de $500",
        "kind": "mutation",
        "event": {
          "name": "confirm_debt_payment",
          "context": { "debt_id": "laptop", "extra_payment": 500 }
        }
      }
    }

- DebtCard: exige kind=mutation y confirm_debt_payment. La operación MCP registra
  un abono único en el perfil de demostración. El repositorio verifica saldo, deuda,
  precisión monetaria y reintentos. Una deuda liquidada se presenta como texto.
- PlanCard: exige kind=simulation y select_plan, que ejecuta project_investment
  mediante MCP. Cierra la selección mostrando la proyección; no compra una inversión.
- Las gráficas de simulación de deuda pueden incluir la misma confirmación cuando
  el monto es válido. Las gráficas analíticas no necesitan un botón.
- action conserva las acciones secundarias y la compatibilidad del flujo de exploración.
  Su presencia sola no satisface el requisito contextual.
- Notice no acepta acciones; se reserva para clarificación o errores. Las notas educativas
  y los comprobantes usan Text.

El renderer muestra un botón estándar por descriptor y conserva el envelope A2UI v0.9:
nombre, contexto, superficie, componente y timestamp. Nunca ejecuta una acción al renderizar.
El backend resuelve nombres a herramientas explícitamente en ACTION_TOOLS; no despacha
herramientas arbitrarias recibidas del cliente. La validación de tarjetas también comprueba
que el identificador de deuda o plan coincida con su binding.

## Nueva operación

1. Registrar la herramienta MCP y su implementación, con las comprobaciones del dominio.
2. Agregar su evento/contexto estricto a eventSchema y su variante de cierre apropiada.
   Si hay varias mutaciones, discriminar sus eventos por nombre dentro de kind=mutation.
3. Agregar el nombre permitido en ClientAction, su modelo de parámetros, el mapeo
   ACTION_TOOLS y la rama correspondiente de handle_action.
4. Construir el descriptor con datos verificados en Python. El LLM solo clasifica la consulta.
5. Ejecutar npm run contracts:generate; agregar casos al fixture compartido y una prueba
   de integración MCP que verifique el efecto real.
6. Ejecutar npm test, npm run typecheck, npm run build,
   python -m pytest services/ai/tests y las pruebas de navegador afectadas.

Los fixtures compartidos comprueban aceptación/rechazo en Zod y en el backend, incluyendo
acciones ausentes, herramientas desconocidas, contextos adicionales, ceros y centavos.
La validación Python usa aritmética decimal para multipleOf, evitando rechazar valores
como 0.29 por errores de representación binaria.

## Clarificación

Las entradas evidentemente inválidas, como m, se interceptan antes del LLM y de MCP.
El planificador conserva las intenciones granulares del proveedor y los guardrails locales.
La heurística de vocales y longitud marca incomprensible; el orquestador lo traduce a
clarificacion sin invocar MCP. Los errores de datos, disponibilidad y cuota usan query_issue. La respuesta solo contiene Notice
y su contenedor, sin acciones ni herramientas financieras. Consultas como
“¿En qué gasté más este mes?” conservan sus gráficas y tablas.

## Renombrado del proyecto

Los paquetes usan @lazy-bank/* y el catálogo lazy-bank:finance-v1. Los nombres visibles
son Lazy Bank; Android usa com.lazybank.demo y el callback nativo es
lazy-bank://auth/callback. Registrar este callback/logout en Auth0 y reconstruir el
development build móvil para aplicar el nuevo identificador. Los ejemplos y valores
por defecto de infraestructura usan lazy-bank; los servicios, volúmenes y configuraciones
externas existentes no se migran automáticamente al editar el código.
