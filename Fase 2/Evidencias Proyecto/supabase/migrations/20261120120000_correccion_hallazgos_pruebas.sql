-- Corrección de hallazgos de las pruebas · Sprint 7 · 20-11-2026
-- Cubre lo que encontraron las pruebas de backend (HAL-01 a 03, informe del 03-11) y el BUG-05
-- (informe de pruebas del Sprint 7). No cambia datos: solo funciones, un trigger y permisos.
-- Verificación: volver a correr las pruebas de backend; HAL-01 a 03 deben pasar a OK.

-- ------------------------------------------------------------------ HAL-01
-- Un técnico con activo = false podía registrar movimientos: las políticas preguntan por el rol
-- con private.mi_rol() y esa función no miraba `activo`. Con esto, un usuario inactivo no tiene
-- rol para ninguna política. Sigue pudiendo leer su propia fila (usuarios_select_propio_o_admin
-- compara id = auth.uid()), que es lo que usan la app y la web para avisarle que está inactivo.
create or replace function private.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path to ''
as $$
  select u.rol from public.usuarios u where u.id = (select auth.uid()) and u.activo;
$$;

-- ------------------------------------------------------------------ HAL-02
-- anon y authenticated tenían TRUNCATE sobre las tablas de public (permiso por defecto de
-- Supabase). TRUNCATE no pasa por RLS ni por los triggers de auditoría.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- ------------------------------------------------------------------ HAL-03
-- El informe corta los días con `fecha_evento::date`, que usa la zona de la sesión (UTC). Una
-- entrega del 31-10 a las 22:00 en Chile es 01-11 en UTC y no contaba en octubre. Se fija la
-- zona de la función a la de FPC; el cuerpo no cambia.
alter function public.informe_envases_arrendados(uuid, date, date, date)
  set timezone to 'America/Santiago';

-- ------------------------------------------------------------------ BUG-05
-- asignar_folio_despacho hace un UPDATE de folio_operacion y el trigger lo registraba como
-- corrección: la web mostraba «corregido» en movimientos que nadie corrigió. El folio no es una
-- corrección: si lo único que cambia es folio_operacion, no se audita. Los registros que ya
-- existen no se borran (la tabla es inmutable a propósito); la web los descarta al leer.
create or replace function private.auditar_movimiento()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(old) - 'folio_operacion') is distinct from (to_jsonb(new) - 'folio_operacion') then
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
