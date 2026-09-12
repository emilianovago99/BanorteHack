# Dataset financiero sintético

11,602 movimientos de un único perfil de demostración, Alex, entre el 1 de enero de 2024 y el 31 de agosto de 2026. Generado por código con semilla `20260912`; no procede de clientes, bancos ni servicios externos. Todos los usuarios autenticados ven este mismo perfil ficticio.

## Archivos y campos

`transactions.csv` contiene movimientos en MXN:

| Campo | Significado |
| --- | --- |
| `id`, `date` | Identificador estable y fecha ISO |
| `kind` | `income` o `expense`; el importe siempre es positivo |
| `amount_cents` | Importe en centavos enteros para sumar sin pérdida decimal |
| `merchant` | Comercio de destino o fuente del ingreso |
| `category` | Nómina, freelance, bonos y 12 categorías de gastos |
| `account_id` | Cuenta de débito sintética de origen/destino |
| `city`, `method` | Ciudad y medio de pago simulados |
| `recurring` | 1 si el movimiento es recurrente, 0 en otro caso |
| `description` | Descripción legible |

`profile.json` define saldo inicial, presupuestos, metas, dos inversiones y tres obligaciones de crédito, incluyendo saldo, tasa, pago mínimo, límite y día de vencimiento.

## Supuestos

- El periodo inicial es agosto de 2026. “Este mes” y “mes pasado” se refieren a agosto y julio de 2026.
- El saldo disponible es el saldo inicial de $42,000 más todos los ingresos menos todos los gastos hasta el cierre del dataset. No representa un saldo histórico cuando se consulta otro mes.
- Los saldos de inversiones y deudas son fotografías ficticias al cierre; no se reconstruyen desde el CSV. La obligación de la laptop comienza a pagarse después del periodo del dataset.
- Hay muchas microcompras deliberadamente pequeñas para ejercitar búsquedas y agregaciones. No se pretende reproducir una distribución estadística validada de consumidores mexicanos.
- Las cuotas de créditos son salidas de efectivo. Los escenarios de amortización parten del saldo de cierre, sin compras nuevas ni comisiones.
- Las tasas de inversión de 5%, 8% y 11% son supuestos educativos, no tasas de productos disponibles. Se usa tasa mensual equivalente y aportación al final de cada mes; los escenarios inferior y superior no son intervalos de confianza. No se consideran impuestos, inflación ni comisiones.
- Las metas son asignaciones ilustrativas del patrimonio; no se suman de nuevo al saldo.

## Regenerar

Desde la raíz del repositorio, con el servicio Python instalado:

```powershell
.\.venv\Scripts\python -m app.data.generate
```

El generador reemplaza únicamente los dos archivos de datos sintéticos. Reinicia el servicio de IA para cargar el nuevo dataset. `FINANCIAL_DATA_DIR` permite indicar otro directorio con el mismo formato. El repositorio carga los datos en SQLite en memoria con índices y consultas parametrizadas; no modifica el CSV al consultar o simular.
