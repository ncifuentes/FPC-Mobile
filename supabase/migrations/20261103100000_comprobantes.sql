-- Migración 13 · Tarjeta: Comprobante de entrega o retiro por correo al cliente
--
-- QUÉ ES UN COMPROBANTE. El respaldo que recibe el cliente de una visita: el folio del despacho,
-- la fecha, la sucursal, el técnico, el vehículo y los cilindros entregados o retirados. Hay
-- UNO por folio, porque un folio ya es una visita a una sucursal (`asignar_folio_despacho`).
--
-- QUIÉN HACE QUÉ.
--  - La app, al sincronizar una visita ya numerada, llama `registrar_comprobante`: deja anotado
--    a qué correo se envía o por qué no hay correo. Si el técnico se lo pidió al cliente en
--    terreno, puede guardarlo además en la sucursal para las próximas visitas.
--  - Después invoca la Edge Function `enviar-comprobante`, que arma el correo con
--    `datos_comprobante`, lo envía con el proveedor de correo y deja el resultado con
--    `resultado_envio_comprobante`. Las dos funciones solo las puede ejecutar `service_role`.
--
-- POR QUÉ EL TÉCNICO NO ESCRIBE LA TABLA DIRECTO. Tendría que tener INSERT y UPDATE sobre ella, y
-- con UPDATE podría marcar un comprobante como enviado sin que lo fuera. Las funciones validan
-- que el folio sea suyo y escriben solo lo que corresponde. Por lo mismo, guardar el correo en
-- la sucursal pasa por acá: el técnico no tiene UPDATE sobre `sucursales` (solo el admin) y no
-- se le da, porque podría editar cualquier dato del cliente.
--
-- IDEMPOTENCIA. La app reintenta cuando se corta la señal: registrar dos veces el mismo folio no
-- crea otro comprobante, y la Edge Function no reenvía uno ya enviado.

create table public.comprobantes (
  folio_operacion   bigint primary key,
  sucursal_id       uuid not null references public.sucursales (id),
  usuario_id        uuid not null references public.usuarios (id),
  -- null cuando el cliente no tiene o no quiso dar correo (estado `sin_correo`).
  email_destino     text,
  motivo_sin_correo text,
  -- true si el técnico guardó este correo en la sucursal al finalizar la visita.
  email_guardado_en_sucursal boolean not null default false,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'enviado', 'error', 'sin_correo')),
  intentos          int not null default 0,
  ultimo_error      text,
  id_proveedor      text,
  creado_en         timestamptz not null default now(),
  enviado_en        timestamptz,
  constraint comprobantes_correo_coherente check (
    (estado = 'sin_correo') = (email_destino is null)
  )
);

comment on table public.comprobantes is
  'Un comprobante de visita por folio: a qué correo se envió (o por qué no) y el resultado del '
  'envío. Lo escriben solo `registrar_comprobante` y la Edge Function `enviar-comprobante`.';

create index comprobantes_usuario_idx on public.comprobantes (usuario_id);
create index comprobantes_estado_idx  on public.comprobantes (estado) where estado <> 'enviado';

alter table public.comprobantes enable row level security;

create policy comprobantes_select_tecnico on public.comprobantes for select to authenticated
  using ((select private.mi_rol()) = 'tecnico' and usuario_id = (select auth.uid()));

create policy comprobantes_select_admin on public.comprobantes for select to authenticated
  using ((select private.mi_rol()) in ('admin', 'gerente'));

-- Sin políticas de insert, update ni delete: todo pasa por las funciones de abajo.
grant select on public.comprobantes to authenticated;

-- ------------------------------------------------------------------ registrar_comprobante
create or replace function public.registrar_comprobante(
  p_folio               bigint,
  p_email               text,
  p_guardar_en_sucursal boolean default false,
  p_motivo_sin_correo   text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_rol        rol_usuario;
  v_total      int;
  v_propios    int;
  v_sucursales int;
  v_sucursal   uuid;
  v_email      text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_estado     text;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada';
  end if;

  select u.rol into v_rol from public.usuarios u where u.id = v_uid;
  if v_rol is null or v_rol not in ('tecnico', 'admin') then
    raise exception 'Solo un técnico o un administrador puede registrar un comprobante';
  end if;

  select count(*), count(*) filter (where m.usuario_id = v_uid),
         count(distinct m.sucursal_id), min(m.sucursal_id::text)::uuid
    into v_total, v_propios, v_sucursales, v_sucursal
    from public.movimientos m
   where m.folio_operacion = p_folio;

  if v_total = 0 then
    raise exception 'No hay movimientos con el folio %', p_folio;
  end if;
  if v_rol = 'tecnico' and v_propios <> v_total then
    raise exception 'El folio % tiene movimientos de otro usuario', p_folio;
  end if;
  if v_sucursales <> 1 or v_sucursal is null then
    raise exception 'El folio % no corresponde a una sola sucursal', p_folio;
  end if;

  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = '22023',
      message = format('El correo %s no es válido', v_email);
  end if;

  insert into public.comprobantes as c
    (folio_operacion, sucursal_id, usuario_id, email_destino, motivo_sin_correo,
     email_guardado_en_sucursal, estado)
  values
    (p_folio, v_sucursal, v_uid, v_email,
     case when v_email is null
          then coalesce(nullif(btrim(p_motivo_sin_correo), ''), 'El cliente no entregó correo')
     end,
     v_email is not null and coalesce(p_guardar_en_sucursal, false),
     case when v_email is null then 'sin_correo' else 'pendiente' end)
  on conflict (folio_operacion) do nothing;

  if v_email is not null and coalesce(p_guardar_en_sucursal, false) then
    update public.sucursales set email = v_email
     where id = v_sucursal and email is distinct from v_email;
  end if;

  select c.estado into v_estado from public.comprobantes c where c.folio_operacion = p_folio;
  return v_estado;
end;
$$;

comment on function public.registrar_comprobante(bigint, text, boolean, text) is
  'Registra el comprobante de un folio ya asignado: el correo de destino o el motivo por el que '
  'no hay. Opcionalmente guarda ese correo en la sucursal. Idempotente por folio.';

revoke execute on function public.registrar_comprobante(bigint, text, boolean, text) from public, anon;
grant  execute on function public.registrar_comprobante(bigint, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------- datos_comprobante
-- Lo que la Edge Function necesita para armar el correo. Recibe al solicitante (el usuario de la
-- app que la invocó, ya verificado por la función) y comprueba que el folio sea suyo o que sea
-- administrador.
create or replace function public.datos_comprobante(p_folio bigint, p_solicitante uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_comprobante public.comprobantes;
  v_rol         rol_usuario;
  v_datos       jsonb;
begin
  select * into v_comprobante from public.comprobantes where folio_operacion = p_folio;
  if not found then
    raise exception 'No hay comprobante registrado para el folio %', p_folio;
  end if;

  select u.rol into v_rol from public.usuarios u where u.id = p_solicitante;
  if v_comprobante.usuario_id <> p_solicitante and v_rol is distinct from 'admin' then
    raise exception using errcode = '42501',
      message = format('El folio %s no pertenece al usuario', p_folio);
  end if;

  select jsonb_build_object(
           'folio',          v_comprobante.folio_operacion,
           'estado',         v_comprobante.estado,
           'email_destino',  v_comprobante.email_destino,
           'cliente_nombre', cl.nombre,
           'cliente_rut',    cl.rut,
           'sucursal_nombre', s.nombre,
           'sucursal_direccion', s.direccion,
           'sucursal_comuna', s.comuna,
           'sucursal_ciudad', s.ciudad,
           'movimientos', (
             select jsonb_agg(jsonb_build_object(
                      'tipo',           m.tipo,
                      'fecha_evento',   m.fecha_evento,
                      'tecnico',        u.nombre,
                      'patente',        ca.patente,
                      'numero_serie',   c.numero_serie,
                      'codigo_barras',  c.codigo_barras,
                      'producto',       p.nombre,
                      'capacidad',      p.capacidad,
                      'unidad',         p.unidad,
                      'gas',            p.gas_habitual,
                      'es_propiedad_cliente', c.es_propiedad_cliente
                    ) order by m.fecha_evento, m.uuid_local)
               from public.movimientos m
               join public.cilindros c  on c.id  = m.cilindro_id
               join public.productos p  on p.id  = c.producto_id
               join public.usuarios  u  on u.id  = m.usuario_id
               join public.camiones  ca on ca.id = m.camion_id
              where m.folio_operacion = p_folio
           )
         )
    into v_datos
    from public.sucursales s
    join public.clientes cl on cl.id = s.cliente_id
   where s.id = v_comprobante.sucursal_id;

  return v_datos;
end;
$$;

-- --------------------------------------------------------------- resultado_envio_comprobante
-- `p_definitivo`: el proveedor rechazó el correo (dirección inválida) y reintentar no sirve.
-- Si no es definitivo, queda `pendiente` y la app vuelve a invocar la función más tarde.
create or replace function public.resultado_envio_comprobante(
  p_folio        bigint,
  p_enviado      boolean,
  p_id_proveedor text default null,
  p_error        text default null,
  p_definitivo   boolean default false
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.comprobantes
     set intentos     = intentos + 1,
         estado       = case when p_enviado then 'enviado'
                             when p_definitivo then 'error'
                             else 'pendiente' end,
         enviado_en   = case when p_enviado then now() else enviado_en end,
         id_proveedor = coalesce(p_id_proveedor, id_proveedor),
         ultimo_error = case when p_enviado then null else p_error end
   where folio_operacion = p_folio
     and estado = 'pendiente';
$$;

revoke execute on function public.datos_comprobante(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.resultado_envio_comprobante(bigint, boolean, text, text, boolean)
  from public, anon, authenticated;
grant  execute on function public.datos_comprobante(bigint, uuid) to service_role;
grant  execute on function public.resultado_envio_comprobante(bigint, boolean, text, text, boolean)
  to service_role;
