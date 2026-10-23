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
