-- Migración 02 · Sprint 3 · Tarjeta: Índice único uuid_local en movimientos
-- Decisión no obvia: no se crean índices para columnas que ya tienen unique o primary key —
-- Postgres los crea solo y duplicarlos desperdicia escrituras. Eso cubre uuid_local,
-- camiones.patente, clientes.rut, clientes.codigo_kame, productos.envase_codigo,
-- productos.codigo, cilindros.numero_serie, cilindros.codigo_barras y (cliente_id, nombre).

-- historial de un envase y lectura del trigger: desc porque la consulta es
-- order by fecha_evento desc limit 1
create index movimientos_cilindro_fecha_idx on movimientos (cilindro_id, fecha_evento desc);
-- informe mensual por sucursal y período
create index movimientos_sucursal_fecha_idx on movimientos (sucursal_id, fecha_evento);
-- registros del día de un vehículo
create index movimientos_camion_fecha_idx   on movimientos (camion_id, fecha_evento);
-- FK sin índice + columna sobre la que filtran las políticas RLS del técnico
create index movimientos_usuario_idx        on movimientos (usuario_id);
-- todos los envases de un mismo despacho
create index movimientos_folio_idx          on movimientos (folio_operacion)
  where folio_operacion is not null;

create index cilindros_sucursal_actual_idx  on cilindros (sucursal_actual_id);
create index cilindros_producto_idx         on cilindros (producto_id);
create index sucursales_cliente_idx         on sucursales (cliente_id);
create index usuarios_camion_jornada_idx    on usuarios (camion_jornada_id);

-- a lo más una sucursal principal por cliente
create unique index sucursales_una_principal_idx on sucursales (cliente_id) where es_principal;

-- NO se crea el índice parcial movimientos (fecha_sync) where fecha_sync is null que aparecía
-- en la versión 1 del diccionario: con fecha_sync not null nunca tendría una sola fila.
