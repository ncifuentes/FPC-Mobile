-- Fuente de la pantalla de movimientos de la plataforma web (Sprint 6): una fila por movimiento,
-- ya unida con envase, producto, cliente, técnico y vehículo. security_invoker = true hace que
-- la vista respete la RLS de las tablas base: admin y gerente ven todo, el técnico solo lo suyo.
create or replace view public.v_movimientos
with (security_invoker = true) as
select
  m.uuid_local,
  m.tipo,
  m.fecha_evento,
  m.fecha_sync,
  m.fecha_sync - m.fecha_evento as retraso_sync,
  m.codigo_origen,
  m.folio_operacion,
  m.documento_referencia,
  c.id                 as cilindro_id,
  c.numero_serie,
  c.serie_normalizada,
  c.codigo_barras,
  c.deposito,
  c.estado             as estado_actual_cilindro,
  c.es_propiedad_cliente,
  p.codigo             as producto_codigo,
  p.nombre             as producto_nombre,
  p.tipo_envase,
  p.capacidad,
  p.unidad,
  p.gas_habitual,
  s.id                 as sucursal_id,
  s.nombre             as sucursal_nombre,
  s.comuna             as sucursal_comuna,
  cl.id                as cliente_id,
  cl.nombre            as cliente_nombre,
  cl.rut               as cliente_rut,
  u.id                 as usuario_id,
  u.nombre             as tecnico_nombre,
  ca.id                as camion_id,
  ca.patente
from public.movimientos m
join public.cilindros  c  on c.id  = m.cilindro_id
join public.productos  p  on p.id  = c.producto_id
left join public.sucursales s  on s.id  = m.sucursal_id
left join public.clientes   cl on cl.id = s.cliente_id
join public.usuarios   u  on u.id  = m.usuario_id
join public.camiones   ca on ca.id = m.camion_id;

comment on view public.v_movimientos is 'Movimientos con datos de envase, producto, cliente, técnico y vehículo. security_invoker: respeta la RLS de las tablas base.';

revoke all on public.v_movimientos from anon;
grant select on public.v_movimientos to authenticated;

-- Filtros del tablero que no cubren los índices de la migración 20261022120000
create index if not exists movimientos_fecha_evento_idx on public.movimientos (fecha_evento desc);
create index if not exists movimientos_usuario_idx     on public.movimientos (usuario_id);
