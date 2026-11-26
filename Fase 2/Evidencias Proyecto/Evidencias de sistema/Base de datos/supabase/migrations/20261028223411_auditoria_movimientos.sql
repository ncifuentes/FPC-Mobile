-- Auditoría de movimientos · Sprint 6 · 28-10-2026
-- La política movimientos_update_admin permite al admin corregir movimientos (ej. cliente mal
-- escaneado). Para que esa corrección no borre la trazabilidad, cada UPDATE o DELETE deja una fila
-- inmutable con el antes, el después, quién y cuándo. Solo admin y gerente pueden leerla; nadie
-- escribe en ella salvo el trigger.

create table public.movimientos_auditoria (
  id              bigint generated always as identity primary key,
  movimiento_uuid uuid        not null,
  operacion       text        not null check (operacion in ('UPDATE','DELETE')),
  datos_antes     jsonb       not null,
  datos_despues   jsonb,
  cambiado_por    uuid,
  cambiado_en     timestamptz not null default now()
);
comment on table public.movimientos_auditoria is 'Registro inmutable de cada corrección o eliminación de un movimiento: quién, cuándo y qué cambió.';
create index movimientos_auditoria_mov_idx on public.movimientos_auditoria (movimiento_uuid, cambiado_en desc);

alter table public.movimientos_auditoria enable row level security;

-- Solo lectura para admin y gerente; nadie escribe directamente (lo hace el trigger)
create policy movimientos_auditoria_select_admin on public.movimientos_auditoria
  for select to authenticated
  using ((select private.mi_rol()) = any (array['admin'::public.rol_usuario, 'gerente'::public.rol_usuario]));

revoke all on public.movimientos_auditoria from anon;
revoke insert, update, delete on public.movimientos_auditoria from authenticated;
grant select on public.movimientos_auditoria to authenticated;

create or replace function private.auditar_movimiento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.movimientos_auditoria (movimiento_uuid, operacion, datos_antes, datos_despues, cambiado_por)
      values (old.uuid_local, 'UPDATE', to_jsonb(old), to_jsonb(new), (select auth.uid()));
    end if;
    return new;
  else
    insert into public.movimientos_auditoria (movimiento_uuid, operacion, datos_antes, datos_despues, cambiado_por)
    values (old.uuid_local, 'DELETE', to_jsonb(old), null, (select auth.uid()));
    return old;
  end if;
end;
$$;

create trigger movimientos_auditoria_trg
  after update or delete on public.movimientos
  for each row execute function private.auditar_movimiento();
