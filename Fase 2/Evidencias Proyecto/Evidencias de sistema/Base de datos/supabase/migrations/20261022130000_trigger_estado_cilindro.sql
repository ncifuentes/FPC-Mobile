-- Migración 03 · Sprint 3 · Tarjeta: Trigger de estado del cilindro
-- Decisión no obvia: el trigger NO aplica el movimiento entrante. Recalcula el estado desde el
-- movimiento más reciente del envase. La regla "solo si es más reciente" sale sola —el que llega
-- tarde no es el más reciente— y además queda correcto cuando un admin corrige o borra un
-- movimiento, cosa que un after insert puro dejaría desalineada para siempre.

create or replace function private.recalcular_estado_cilindro(p_cilindro_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mov record;
begin
  -- Serializa el recálculo: un lote de sincronización puede traer dos movimientos del mismo
  -- envase y sin este lock ambos leerían el historial antes de escribir.
  perform 1 from public.cilindros where id = p_cilindro_id for update;

  select m.tipo, m.sucursal_id, m.fecha_evento
    into v_mov
    from public.movimientos m
   where m.cilindro_id = p_cilindro_id
   order by m.fecha_evento desc, m.uuid_local desc
   limit 1;

  if not found then
    update public.cilindros
       set estado = 'en_planta', sucursal_actual_id = null, en_cliente_desde = null
     where id = p_cilindro_id;
  elsif v_mov.tipo = 'entrega' then
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
end;
$$;

revoke execute on function private.recalcular_estado_cilindro(uuid)
  from public, anon, authenticated;

create or replace function private.trg_movimientos_estado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalcular_estado_cilindro(old.cilindro_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.cilindro_id is distinct from new.cilindro_id then
    perform private.recalcular_estado_cilindro(old.cilindro_id);
  end if;

  perform private.recalcular_estado_cilindro(new.cilindro_id);
  return new;
end;
$$;

revoke execute on function private.trg_movimientos_estado() from public, anon, authenticated;

create trigger movimientos_mantiene_estado
after insert or update or delete on public.movimientos
for each row execute function private.trg_movimientos_estado();
