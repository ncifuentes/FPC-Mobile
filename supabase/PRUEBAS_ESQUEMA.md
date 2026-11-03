# Verificación del esquema en Supabase — FPC Mobile

**Fecha de ejecución:** 23-10-2026
**Proyecto:** `betqgklumvpneppoqhph` (fpc-mobile, región us-east-1, plan gratuito)
**Herramienta:** Supabase CLI 2.121.0, comando `npx supabase db query --linked`
**Ejecutado por:** Nicolás Castillo

Este documento registra lo que se ejecutó contra la base real. Las salidas se
copiaron de la consola; no se completó ningún valor que no se haya medido.

---

## 1. Migraciones aplicadas

`npx supabase db push` aplicó las seis migraciones sin errores.

| # | Archivo | Contenido |
|---|---|---|
| 01 | `20261022110000_esquema_inicial.sql` | 6 tipos enumerados y 7 tablas con RLS habilitado |
| 02 | `20261022120000_indices.sql` | 10 índices |
| 03 | `20261022130000_trigger_estado_cilindro.sql` | Recalcula el estado derivado del cilindro desde su movimiento más reciente |
| 04 | `20261022140000_politicas_rls.sql` | `mi_rol()`, 29 políticas y los `GRANT` |
| 05 | `20261022150000_carga_catalogo_y_parque.sql` | 77 productos y 2.178 cilindros, todos en `en_planta` |
| 06 | `20261023100000_revocar_rls_auto_enable.sql` | Revoca `EXECUTE` de `public.rls_auto_enable()` a `anon`, `authenticated` y `public`, dentro de un bloque condicional |

**Reset desde cero (`db reset`):** no ejecutado. Docker no está disponible en la
máquina de verificación. Las migraciones no se han probado en una base local
vacía en esta versión.

---

## 2. Verificación de estructura y datos

| Comprobación | Esperado | Obtenido | Resultado |
|---|---|---|---|
| Tablas en `public` | 7 | 7 | ✅ |
| Índices en `public` | 25 | 25 | ✅ |
| Políticas en `public` | 29 | 29 | ✅ |
| Tablas sin RLS | 0 | 0 | ✅ |
| Productos | 77 | 77 | ✅ |
| Cilindros | 2.178 | 2.178 | ✅ |
| Cilindros con `es_propiedad_cliente` | 89 | 89 | ✅ |
| Productos sin capacidad | 1 (PRO) | 1 | ✅ |
| Cilindros fuera de `en_planta` | 0 | 0 | ✅ |
| FK rotas en cilindros | 0 | 0 | ✅ |
| Números de serie repetidos | 0 | 0 | ✅ |

---

## 3. Advisor de seguridad

**Antes de la migración 06:** 2 avisos `WARN` sobre `public.rls_auto_enable()`:
función `SECURITY DEFINER` creada por la plataforma, con `EXECUTE` para `anon`
y `authenticated`.

**Después de la migración 06:** `No issues found`.

Verificación directa de privilegios: `anon` no puede ejecutar la función
(`false`) y `authenticated` tampoco (`false`).

---

## 4. Pruebas de comportamiento

Se ejecutaron dentro de una transacción que termina en un `raise exception`, lo
que revierte todos los cambios. Los datos de prueba fueron inventados: un
cliente con RUT `1-9`, una sucursal, un camión, dos usuarios y un cilindro de
serie `PRUEBA-SERIE-001`.

Como la transacción se revierte, **no queda ningún registro de prueba**. Ver la
sección 5.

| # | Prueba | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| A1 | Entrega de hoy | `en_cliente`, con sucursal y `en_cliente_desde` de hoy | `en_cliente`, sucursal ✔, `en_cliente_desde` ✔ | ✅ |
| A2 | Carga de hace 3 días | El estado no cambia | `en_cliente` | ✅ |
| A3 | Retiro de ahora | `en_camion`, con sucursal y `en_cliente_desde` en `null` | `en_camion`, ambos `null` | ✅ |
| B1 | Mismo `uuid_local` dos veces con `on conflict do nothing` | 2.º insert afecta 0 filas; 1 fila; estado sin cambio | 0 filas; 1 fila; `en_cliente` antes y después | ✅ |
| C1 | Insert con `usuario_id` de otro técnico | Rechazado | `42501`, violación de RLS | ✅ |
| C2 | Insert con el propio `usuario_id` | 1 fila | 1 fila | ✅ |
| C3 | Update de un movimiento propio como técnico | 0 filas afectadas | 0 filas afectadas | ✅ |
| C3b | Valor tras el update rechazado | `null` | `null` | ✅ |
| C4 | Técnico A consulta movimientos | 5 visibles | 5 | ✅ |
| C5 | Técnico B consulta movimientos de A | 0 visibles | 0 | ✅ |

**Resultado: 10 de 10 comprobaciones pasaron.**

Salida textual de la consola, sin editar:

```
A1 entrega de hoy: estado=en_cliente | sucursal_ok=t | desde_ok=t
A2 carga de hace 3 dias: estado=en_cliente (esperado en_cliente)
A3 retiro de ahora: estado=en_camion (esperado en_camion) | sucursal_null=t | desde_null=t
B1 mismo uuid_local dos veces: filas_2do_insert=0 (esperado 0) | filas_con_uuid=1 (esperado 1) | estado_antes=en_cliente despues=en_cliente (esperado igual)
C1 insert con usuario_id ajeno: 42501 new row violates row-level security policy for table "movimientos" (esperado rechazo)
C2 insert propio: filas=1 (esperado 1)
C3 update de movimiento propio como tecnico: filas=0 (esperado 0)
C4 tecnico A ve sus movimientos: 5 (esperado 5)
C5 tecnico B ve movimientos de A: 0 (esperado 0)
C3b documento tras el update rechazado: null (esperado null)
```

---

## 5. Limpieza

Después de las pruebas se verificó que no quedó ningún dato de prueba:

| Comprobación | Resultado |
|---|---|
| Usuarios de prueba en `auth.users` | 0 |
| Clientes de prueba | 0 |
| Camiones de prueba | 0 |
| Cilindros de prueba | 0 |
| Movimientos en la base | 0 |

---

## 6. Límites de esta verificación

- Las pruebas de RLS simulan la sesión con los claims JWT dentro de la base
  (`request.jwt.claims`). **No se probó con un login real desde la app.** Esa
  prueba queda pendiente para el Sprint 5, cuando la app se conecte a Supabase.
- `movimientos` no tiene política de borrado. Como las pruebas se revirtieron,
  no fue necesario borrar nada.
- Los avisos del advisor pueden volver si Supabase vuelve a crear la función
  `rls_auto_enable()` o a otorgarle permisos. La migración 06 los revoca solo
  en la base actual.

---

## 7. Observaciones abiertas

- **Tarjeta del tablero:** dice «Crear esquema Supabase, cinco tablas», pero la
  migración 01 crea **siete tablas**. Conviene corregir el texto de la tarjeta.
- **Privilegio sobre el schema `private`:** no está declarado en ninguna
  migración. El equipo verificó que PostgreSQL evalúa las políticas con los
  privilegios del dueño de la tabla, así que no hace falta. Esa verificación
  la hizo el equipo en PostgreSQL 16; no se repitió en esta sesión.
- **Sprint:** la tarjeta corresponde al Sprint 3 (28-09 al 11-10). Esta
  verificación se ejecutó el 23-10, fuera del plazo del sprint.

---

## Sprint 4 — Clientes, informe de envases arrendados y Realtime

**Fecha de ejecución:** 28-10-2026
**Proyecto:** `betqgklumvpneppoqhph` (fpc-mobile, región us-east-1, plan gratuito)
**Herramienta:** Supabase CLI 2.122.0, `npx supabase db push` y `npx supabase db query --linked`
**Ejecutado por:** Nicolás Castillo

### 1. Migraciones aplicadas

`npx supabase db push` aplicó las tres migraciones nuevas sin errores:

| # | Archivo | Contenido |
|---|---|---|
| 07 | `20261026100000_migrar_clientes_y_sucursales.sql` | 181 clientes y 190 sucursales desde `Clientes_filtro.xlsx` |
| 08 | `20261026110000_informe_envases_arrendados.sql` | Función `informe_envases_arrendados`, `SECURITY INVOKER` |
| 09 | `20261026120000_realtime_movimientos.sql` | Agrega `movimientos` a la publicación `supabase_realtime` |

### 2. Verificación de estructura y datos

| Comprobación | Esperado | Obtenido | Resultado |
|---|---|---|---|
| Clientes | 181 | 181 | ✅ |
| Sucursales | 190 | 190 | ✅ |
| Sucursales principales | 181 | 181 | ✅ |
| Sucursales sin región | 0 | 0 | ✅ |
| Clientes con más de una sucursal | 6 | 6 | ✅ |
| `movimientos` en `supabase_realtime` | presente | presente | ✅ |

Distribución por región (obtenida):

| Región | Sucursales | % |
|---|---|---|
| Metropolitana | 116 | 61,1 % |
| Maule | 40 | 21,1 % |
| O'Higgins | 23 | 12,1 % |
| Valparaíso | 6 | 3,2 % |
| La Araucanía | 4 | 2,1 % |
| Los Ríos | 1 | 0,5 % |

La RM sale ~61 %, no ~80 % como decía el audio inicial del levantamiento. Coincide con lo
esperado en la tarjeta del Sprint 4.

### 3. Advisor de seguridad

`npx supabase db advisors --linked` encontró **un hallazgo nuevo de categoría SECURITY**
que no estaba antes de esta migración:

| Nivel | Función/tabla | Detalle |
|---|---|---|
| WARN (SECURITY) | `public.informe_envases_arrendados` | `search_path` mutable: la función no fija `search_path`, así que un `search_path` de sesión hostil podría hacer que resuelva `public.movimientos`, `public.cilindros`, etc. contra objetos de otro schema. |

**Esto no estaba cubierto por "debe seguir sin hallazgos de seguridad"** del encargo
original: la migración 08 introduce una función nueva y esa función quedó sin
`set search_path = ...`. No se tocó la migración para corregirlo (está marcada como "no
reescribir"); queda para que el equipo decida si agrega `set search_path = public, pg_temp`
a la función en una migración aparte.

Además siguen los dos avisos de rendimiento (no seguridad) ya conocidos, sobre políticas
permisivas múltiples en `movimientos` para `admin`/`tecnico` — preexistentes desde el
Sprint 3, no introducidos por esta migración.

### 4. Nota metodológica: cómo se corrieron las pruebas

`supabase/pruebas/prueba_sprint4.sql` está escrito para `psql` (usa `\set`, `\gset`,
`\echo`, `\pset`). En esta máquina no hay `psql` ni Docker instalados, y
`npx supabase db query` no tiene un subcomando `execute` ni entiende metacomandos de
psql. El archivo **no se modificó**; en su lugar se ejecutó una traducción 1:1 a SQL
puro (mismos datos de fixture, mismas fechas, mismo orden, misma función, mismas
aserciones), reemplazando las variables de psql por `set_config(..., false)` y leyendo
los seis casos en un único `SELECT` final dentro de la misma transacción — sin `ROLLBACK`
explícito, porque revertir la transacción también deshace el `set_config` no local
(comportamiento documentado de Postgres). Al no haber `COMMIT`, Postgres aborta la
transacción sola al cerrar la conexión; la sección 5 confirma que no quedó nada.

### 5. Pruebas de la función `informe_envases_arrendados`

Caso de referencia: informe real "Detalles de Alquiler de Cilindros" (WESEH0) que KAME
ONE emitió el 26/10/2026 para el cliente `000298`.

| Caso | Qué prueba | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | Informe real de octubre | `RENC53` 3/74 · `RENC54` 0/6 · `RENN57` 2/78 · total 5/158 | `RENC53` 3/74 · `RENC54` 0/6 · `RENN57` 2/78 · total **envases=5 dias=158** | ✅ |
| 2 | Corte al 15/10 | `RENC53` 2/30 · `RENC54` 0/6 · `RENN57` 2/48 · total 4/84 | `RENC53` 2/30 · `RENC54` 0/6 · `RENN57` 2/48 | ✅ |
| 3 | Septiembre, sin devoluciones en el periodo | `RENC53` 2/52 · `RENC54` 1/30 · `RENN57` 5/94 | `RENC53` 2/52 · `RENC54` 1/30 · `RENN57` 5/94 | ✅ |
| 4 | Envase `PRO` entregado no se arrienda | total sigue en 5/158 | **envases=5 dias=158** | ✅ |
| 5 | Técnico no puede pedir el informe | rechazado | `OK rechazado: El informe de arriendo solo esta disponible para admin o gerente` | ✅ |
| 6 | Periodo invertido / corte fuera del periodo | ambos rechazados | `OK rechazado: Periodo invalido: p_desde=2026-10-31 p_hasta=2026-10-01` · `OK rechazado: La fecha de corte 2026-11-20 debe caer dentro del periodo 2026-10-01 a 2026-10-31` | ✅ |

Comprobación previa: los 11 cilindros del informe real están en el parque cargado
(`11 de 11`).

**Resultado: 6 de 6 casos pasaron, con los números exactos del informe real.**

### 6. Limpieza

| Comprobación | Resultado |
|---|---|
| Clientes de prueba (`rut='76111222-3'`) | 0 |
| Camiones de prueba (`patente='PRUE98'`) | 0 |
| Usuarios de prueba (`nombre like '% Prueba'`) | 0 |
| `auth.users` huérfanos sin email ni fila en `usuarios` | 0 |
| `movimientos` en la base | 0 |

### 7. Observaciones abiertas del Sprint 4

- **Hallazgo de seguridad nuevo:** ver sección 3. `informe_envases_arrendados` queda sin
  `search_path` fijo; no se corrigió porque implicaba tocar la migración ya probada.
- **No se probó `db reset` desde cero** por la misma razón que en el Sprint 3: no hay
  Docker en esta máquina.
- **No se conectó la app a Supabase.** Queda para el Sprint 5, según la tarjeta.

---

## Sprint 5 — Sincronización de la app, folio de despacho y comprobante por correo

**Fecha de ejecución:** 03-11-2026
**Proyecto:** `betqgklumvpneppoqhph` (fpc-mobile, producción)
**Herramienta:** Supabase CLI 3.0 vía `npx supabase` (`migration list`, `db push`, `db query --linked`, `functions deploy`)

### 1. Migraciones aplicadas desde el Sprint 4

`npx supabase migration list --linked` muestra las 16 migraciones locales también aplicadas
en el proyecto, sin diferencias. Las posteriores a la sección anterior:

| Archivo | Contenido |
|---|---|
| `20261028100000_fijar_search_path_informe.sql` | Fija el `search_path` de `informe_envases_arrendados` (cierra el hallazgo de la sección 3 del Sprint 4) |
| `20261028223411_auditoria_movimientos.sql` | Tabla de auditoría con el antes y el después de cada corrección de un movimiento |
| `20261028230000_recarga_parque_cilindros.sql` | Recarga el parque de cilindros con las series corregidas |
| `20261029002707_serie_normalizada.sql` | Búsqueda de la serie sin importar mayúsculas ni espacios, con índice único |
| `20261029002715_vista_v_movimientos.sql` | Vista `v_movimientos` para la web, con `security_invoker` |
| `20261029100000_asignar_folio_despacho.sql` | Migración 12: función para que la app pida el folio de despacho al sincronizar |
| `20261103100000_comprobantes.sql` | Migración 13: comprobante de visita por correo (ver sección 2) |

Las pruebas de las migraciones de auditoría, recarga, serie y vista no se registraron en este
documento.

### 2. Migración 13 — comprobantes

Crea la tabla `comprobantes` (uno por folio, con estado `pendiente`, `enviado`, `error` o
`sin_correo`) y tres funciones:

- `registrar_comprobante`: la llama la app con la sesión del técnico al cerrar la visita.
- `datos_comprobante` y `resultado_envio_comprobante`: solo las usa la Edge Function, con
  `service_role`.

**Prueba antes de aplicar.** La migración se ejecutó dentro de una transacción con un bloque
de casos que termina en `raise exception`, así que todo se revierte. Resultados:

| Caso | Resultado |
|---|---|
| Registrar el mismo folio dos veces no duplica | ✅ |
| Sin correo queda `sin_correo` con el motivo | ✅ |
| Correo inválido se rechaza (`22023`) | ✅ |
| Otro técnico no puede registrar el comprobante de un folio ajeno | ✅ |
| `authenticated` no puede ejecutar `datos_comprobante` ni actualizar la tabla | ✅ |
| Las funciones de `service_role` devuelven los datos y registran el envío | ✅ |
| Un comprobante ya `enviado` no vuelve a cambiar de estado | ✅ |

Después del rollback, la tabla no existía y el correo de la sucursal usada seguía igual.

**Verificación después de `db push`:**

| Comprobación | Esperado | Obtenido | Resultado |
|---|---|---|---|
| RLS en `comprobantes` | activa | activa | ✅ |
| Políticas | `comprobantes_select_tecnico`, `comprobantes_select_admin` | las dos | ✅ |
| `registrar_comprobante` (authenticated / service_role) | sí / no | sí / no | ✅ |
| `datos_comprobante` (authenticated / service_role) | no / sí | no / sí | ✅ |
| `resultado_envio_comprobante` (authenticated / service_role) | no / sí | no / sí | ✅ |

### 3. Edge Function `enviar-comprobante`

Desplegada con `npx supabase functions deploy enviar-comprobante`. Una llamada sin sesión
devuelve `401 Missing authorization header`.

**No probado:** el envío real de un correo. La función necesita los secretos
`RESEND_API_KEY` y `COMPROBANTE_REMITENTE`, que no están configurados porque FPC todavía no
define el dominio remitente. Sin ellos, los comprobantes quedan `pendiente` y no se pierden.

### 4. Cambios de datos en producción

- **Folio 5 (Agricovial S.A.):** venía de una visita de prueba interna y quedó `pendiente`
  con el correo real del cliente. Se cambió a `error` con el motivo «Visita de prueba
  interna: no enviar al cliente», para que la función no lo envíe nunca.
- **Cliente de prueba:** «CLIENTE DE PRUEBA (no facturar)», RUT `11111111-1`, con la sucursal
  «PRUEBA» y un correo del equipo. Las visitas de prueba se hacen con este cliente. Es
  visible para los técnicos en la app.

### 5. Pruebas de la app (sin red)

| Archivo | Qué prueba | Resultado |
|---|---|---|
| `pruebas/prueba_sync_local.mjs` (en `main`) | Ciclo de envío de movimientos y folio | 14/14 |
| `pruebas/prueba_sync_local.mjs` (en `feat/comprobantes`) | Además, visitas y comprobantes | 26/26 |
| `pruebas/prueba_comprobante_local.mjs` (en `feat/comprobantes`) | Plantilla del correo | 8/8 |

### 6. Observaciones abiertas del Sprint 5

- **Comprobante en pausa:** falta el dominio remitente de FPC, configurar Resend y probar un
  envío real con el cliente de prueba.
- **Folio por visita:** en `main`, con señal, cada cilindro de una visita recibe un folio
  distinto. El arreglo está en `feat/comprobantes`.
- **`prueba_sync_movimientos.mjs` en la rama** se ajustó al nuevo contrato de `asignarFolio`,
  pero no se volvió a correr contra Supabase.
- **No se probó `db reset` desde cero**, igual que en los sprints anteriores.
