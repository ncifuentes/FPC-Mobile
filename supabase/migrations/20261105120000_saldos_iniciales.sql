-- Saldo inicial de los cilindros · 05-11-2026
--
-- EL PROBLEMA. La carga inicial KAME (05-11) dejó 559 cilindros `en_cliente` escribiendo directo
-- en `cilindros`, sin movimientos. Eso tiene dos fallas:
--   1. El informe de arriendo se calcula solo con entregas de `movimientos`: esos 559 dan 0.
--   2. El estado es DERIVADO de `movimientos` (trigger de la migración 03). Si un cilindro cargado
--      recibe un movimiento y ese movimiento se borra, el recálculo no encuentra historial y lo deja
--      `en_planta`: se pierde el cliente real.
--
-- LA SOLUCION. Una «foto» de partida por cilindro, separada del historial: `saldos_iniciales`. El
-- estado sigue siendo derivado, pero ahora de dos fuentes:
--   * si hay movimientos con fecha_evento POSTERIOR al saldo, manda el último (como hasta hoy);
--   * si no hay ninguno posterior, manda el saldo (en_cliente, su sucursal, en_cliente_desde = desde);
--   * sin saldo ni movimientos, en_planta (como hasta hoy).
-- Los movimientos anteriores o iguales a `desde` quedan superados por la foto: la foto es la
-- verdad a esa fecha. Un cilindro sin saldo se comporta exactamente igual que antes.
--
-- POR QUE NO MOVIMIENTOS SINTETICOS DE ENTREGA. Exigirían inventar técnico, camión y origen, se
-- mezclarían con la operación real en el historial, la auditoría y los comprobantes, y movimientos
-- no admite delete. El saldo es un dato de otra naturaleza y queda aparte.
--
-- El informe de arriendo trata el saldo como una entrega en `desde` que dura hasta el primer
-- movimiento posterior del cilindro, con la misma aritmética de días (fin exclusivo, recorte por
-- periodo y corte). Un retiro y una nueva entrega generan dos estadías que no se solapan.
--
-- Sin datos literales: el llenado sale de los cilindros que hoy están en_cliente sin movimientos
-- (los de la carga KAME). En una base nueva (db reset) inserta 0 filas.
--
-- Aplicada en remoto el 05-11-2026 con `db push --remote --yes`: 559 saldos en 94 sucursales; el
-- estado de los cilindros y los movimientos quedaron idénticos (mismo hash antes y después).

-- ---------------------------------------------------------------- tabla
create table public.saldos_iniciales (
  cilindro_id uuid primary key references public.cilindros (id) on delete cascade,
  sucursal_id uuid not null references public.sucursales (id) on delete restrict,
  desde       timestamptz not null,
  origen      text not null,
  creado_en   timestamptz not null default now()
);

comment on table public.saldos_iniciales is
  'Ubicación de partida de un cilindro (foto inicial, p. ej. la carga KAME). El estado del cilindro '
  'sale de aquí mientras no tenga movimientos posteriores a `desde`; el informe de arriendo lo '
  'cuenta como una entrega en `desde`.';

create index saldos_iniciales_sucursal_idx on public.saldos_iniciales (sucursal_id);

alter table public.saldos_iniciales enable row level security;

-- Igual que el catálogo: lee cualquier usuario con rol; escribe solo el administrador.
create policy saldos_iniciales_select_todos on public.saldos_iniciales for select to authenticated
  using ((select private.mi_rol()) is not null);
create policy saldos_iniciales_insert_admin on public.saldos_iniciales for insert to authenticated
  with check ((select private.mi_rol()) = 'admin');
create policy saldos_iniciales_update_admin on public.saldos_iniciales for update to authenticated
  using ((select private.mi_rol()) = 'admin') with check ((select private.mi_rol()) = 'admin');
create policy saldos_iniciales_delete_admin on public.saldos_iniciales for delete to authenticated
  using ((select private.mi_rol()) = 'admin');

revoke all on public.saldos_iniciales from anon;
grant select, insert, update, delete on public.saldos_iniciales to authenticated;

-- ---------------------------------------------------------------- recálculo del estado
create or replace function private.recalcular_estado_cilindro(p_cilindro_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mov         record;
  v_saldo_suc   uuid;
  v_saldo_desde timestamptz;
begin
  -- Serializa el recálculo: un lote de sincronización puede traer dos movimientos del mismo
  -- envase y sin este lock ambos leerían el historial antes de escribir.
  perform 1 from public.cilindros where id = p_cilindro_id for update;

  select s.sucursal_id, s.desde into v_saldo_suc, v_saldo_desde
    from public.saldos_iniciales s
   where s.cilindro_id = p_cilindro_id;

  -- Solo cuentan los movimientos posteriores a la foto inicial (todos, si no hay saldo).
  select m.tipo, m.sucursal_id, m.fecha_evento
    into v_mov
    from public.movimientos m
   where m.cilindro_id = p_cilindro_id
     and (v_saldo_desde is null or m.fecha_evento > v_saldo_desde)
   order by m.fecha_evento desc, m.uuid_local desc
   limit 1;

  if found then
    if v_mov.tipo = 'entrega' then
      update public.cilindros
         set estado = 'en_cliente',
             sucursal_actual_id = v_mov.sucursal_id,
             en_cliente_desde   = v_mov.fecha_evento
       where id = p_cilindro_id;
    else  -- carga y retiro dejan el envase en el vehículo
      update public.cilindros
         set estado = 'en_camion', sucursal_actual_id = null, en_cliente_desde = null
       where id = p_cilindro_id;
    end if;
  elsif v_saldo_suc is not null then
    update public.cilindros
       set estado = 'en_cliente', sucursal_actual_id = v_saldo_suc, en_cliente_desde = v_saldo_desde
     where id = p_cilindro_id;
  else
    update public.cilindros
       set estado = 'en_planta', sucursal_actual_id = null, en_cliente_desde = null
     where id = p_cilindro_id;
  end if;
end;
$$;

revoke execute on function private.recalcular_estado_cilindro(uuid) from public, anon, authenticated;

-- Crear, mover o borrar un saldo también recalcula el estado.
create or replace function private.trg_saldos_estado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.recalcular_estado_cilindro(old.cilindro_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.cilindro_id is distinct from old.cilindro_id
                                        or new.sucursal_id is distinct from old.sucursal_id
                                        or new.desde is distinct from old.desde) then
    perform private.recalcular_estado_cilindro(new.cilindro_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.trg_saldos_estado() from public, anon, authenticated;

create trigger saldos_iniciales_mantiene_estado
after insert or update or delete on public.saldos_iniciales
for each row execute function private.trg_saldos_estado();

-- ---------------------------------------------------------------- informe de arriendo
-- Misma función de la migración 08 (con el search_path de la 11). Único cambio: el CTE `movs`
-- suma el saldo como una entrega en `desde` y descarta los movimientos anteriores o iguales a él.
create or replace function public.informe_envases_arrendados(
  p_cliente_id uuid,
  p_desde      date,
  p_hasta      date,
  p_corte      date default null
)
returns table (
  envase_codigo text,
  codigo_arriendo text,
  producto text,
  envases bigint,
  dias bigint
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_rol    rol_usuario;
  v_corte  date := coalesce(p_corte, p_hasta);
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Periodo invalido: p_desde=% p_hasta=%', p_desde, p_hasta;
  end if;

  if v_corte < p_desde or v_corte > p_hasta then
    raise exception 'La fecha de corte % debe caer dentro del periodo % a %',
                    v_corte, p_desde, p_hasta;
  end if;

  select u.rol into v_rol from public.usuarios u where u.id = (select auth.uid());
  if v_rol is null or v_rol not in ('admin', 'gerente') then
    raise exception 'El informe de arriendo solo esta disponible para admin o gerente';
  end if;

  return query
  with eventos as (
    -- Movimientos posteriores al saldo (todos, si el cilindro no tiene saldo)...
    select m.cilindro_id, m.sucursal_id, m.tipo, m.fecha_evento, 1 as orden, m.uuid_local
      from public.movimientos m
      left join public.saldos_iniciales si on si.cilindro_id = m.cilindro_id
     where si.desde is null or m.fecha_evento > si.desde
    union all
    -- ...y el saldo como una entrega en `desde`.
    select si.cilindro_id, si.sucursal_id, 'entrega'::public.tipo_movimiento, si.desde, 0, null::uuid
      from public.saldos_iniciales si
  ),
  movs as (
    -- lead() sobre TODOS los eventos del envase: cualquier movimiento posterior a una entrega
    -- significa que el envase dejo de estar en ese cliente, sea retiro o no.
    select e.cilindro_id,
           e.sucursal_id,
           e.tipo,
           e.fecha_evento,
           lead(e.fecha_evento) over (
             partition by e.cilindro_id order by e.fecha_evento, e.orden, e.uuid_local
           ) as fin_estadia
      from eventos e
  ),
  estadias as (
    select mv.cilindro_id,
           greatest(mv.fecha_evento::date, p_desde)                            as desde,
           least(coalesce(mv.fin_estadia::date, v_corte + 1), v_corte + 1)     as hasta_excl,
           (mv.fecha_evento::date <= v_corte
            and coalesce(mv.fin_estadia::date, v_corte + 1) > v_corte)         as retenido
      from movs mv
      join public.sucursales s on s.id = mv.sucursal_id
      join public.cilindros  c on c.id = mv.cilindro_id
     where mv.tipo = 'entrega'
       and s.cliente_id = p_cliente_id
       and c.es_propiedad_cliente = false
       and mv.fecha_evento::date <= v_corte
       and coalesce(mv.fin_estadia::date, v_corte + 1) > p_desde
  )
  select p.envase_codigo,
         p.codigo,
         p.nombre,
         count(distinct e.cilindro_id) filter (where e.retenido)::bigint,
         sum(greatest(0, e.hasta_excl - e.desde))::bigint
    from estadias e
    join public.cilindros c on c.id = e.cilindro_id
    join public.productos p on p.id = c.producto_id
   group by p.envase_codigo, p.codigo, p.nombre
   having sum(greatest(0, e.hasta_excl - e.desde)) > 0
   order by p.codigo;
end;
$$;

revoke execute on function public.informe_envases_arrendados(uuid, date, date, date) from public, anon;
grant  execute on function public.informe_envases_arrendados(uuid, date, date, date) to authenticated;

-- ---------------------------------------------------------------- llenado
-- Los cilindros en_cliente sin ningún movimiento solo pueden venir de una carga directa: el
-- trigger nunca deja en_cliente a un cilindro sin historial.
insert into public.saldos_iniciales (cilindro_id, sucursal_id, desde, origen)
select c.id, c.sucursal_actual_id, c.en_cliente_desde, 'carga inicial KAME 27-10-2026'
  from public.cilindros c
 where c.estado = 'en_cliente'
   and not exists (select 1 from public.movimientos m where m.cilindro_id = c.id)
on conflict (cilindro_id) do nothing;

-- Guarda: cada cilindro en_cliente sin movimientos tiene su saldo, con la misma sucursal y fecha,
-- y el recálculo con la regla nueva no cambia ningún cilindro.
do $$
declare
  v_saldos   int;
  v_sin      int;
  v_antes    text;
  v_despues  text;
begin
  select count(*) into v_saldos from public.saldos_iniciales;
  select count(*) into v_sin
    from public.cilindros c
   where c.estado = 'en_cliente'
     and not exists (select 1 from public.movimientos m where m.cilindro_id = c.id)
     and not exists (select 1 from public.saldos_iniciales s
                      where s.cilindro_id = c.id and s.sucursal_id = c.sucursal_actual_id
                        and s.desde = c.en_cliente_desde);
  if v_sin > 0 then
    raise exception 'Saldo inicial incompleto: % cilindros en_cliente sin saldo equivalente', v_sin;
  end if;

  select md5(string_agg(id::text || estado || coalesce(sucursal_actual_id::text, '')
                        || coalesce(en_cliente_desde::text, ''), '|' order by id))
    into v_antes from public.cilindros;
  perform private.recalcular_estado_cilindro(c.id) from public.cilindros c;
  select md5(string_agg(id::text || estado || coalesce(sucursal_actual_id::text, '')
                        || coalesce(en_cliente_desde::text, ''), '|' order by id))
    into v_despues from public.cilindros;
  if v_antes is distinct from v_despues then
    raise exception 'La regla nueva cambia el estado de algún cilindro';
  end if;

  raise notice 'saldos_iniciales: % filas; estado de cilindros sin cambios', v_saldos;
end $$;
