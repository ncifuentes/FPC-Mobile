-- Migración 04 · Sprint 3 · Tarjeta: Políticas RLS por rol
-- Decisión no obvia: movimientos NO recibe política de delete para ningún rol. Sin política,
-- RLS lo niega a todos. En un sistema que controla carga peligrosa, un historial que se puede
-- borrar no sirve como respaldo. Las correcciones son update del administrador y quedan
-- registradas.

create or replace function private.mi_rol()
returns rol_usuario language sql stable security definer set search_path = '' as $$
  select u.rol from public.usuarios u where u.id = (select auth.uid());
$$;

-- security definer acá no es opcional: usuarios tiene RLS y sus propias políticas llaman a esta
-- función. Sin security definer la evaluación entra en recursión infinita. Es segura porque
-- solo devuelve el rol del propio usuario conectado.
revoke execute on function private.mi_rol() from public, anon;
grant  execute on function private.mi_rol() to authenticated;

-- ---------------------------------------------------------------- movimientos
create policy movimientos_insert_tecnico on movimientos for insert to authenticated
  with check ((select private.mi_rol()) = 'tecnico' and usuario_id = (select auth.uid()));

create policy movimientos_insert_admin on movimientos for insert to authenticated
  with check ((select private.mi_rol()) = 'admin');

create policy movimientos_select_tecnico on movimientos for select to authenticated
  using ((select private.mi_rol()) = 'tecnico' and usuario_id = (select auth.uid()));

create policy movimientos_select_admin on movimientos for select to authenticated
  using ((select private.mi_rol()) in ('admin', 'gerente'));

create policy movimientos_update_admin on movimientos for update to authenticated
  using      ((select private.mi_rol()) = 'admin')
  with check ((select private.mi_rol()) = 'admin');

-- movimientos NO lleva política de delete. Es deliberado, no un olvido: ver la cabecera.

-- ---------------------------------------------------------------- catálogos
do $$
declare t text;
begin
  foreach t in array array['camiones','clientes','sucursales','productos','cilindros'] loop
    execute format(
      'create policy %1$s_select_todos on %1$I for select to authenticated
         using ((select private.mi_rol()) is not null)', t);
    execute format(
      'create policy %1$s_insert_admin on %1$I for insert to authenticated
         with check ((select private.mi_rol()) = ''admin'')', t);
    execute format(
      'create policy %1$s_update_admin on %1$I for update to authenticated
         using ((select private.mi_rol()) = ''admin'')
         with check ((select private.mi_rol()) = ''admin'')', t);
    execute format(
      'create policy %1$s_delete_admin on %1$I for delete to authenticated
         using ((select private.mi_rol()) = ''admin'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- usuarios
create policy usuarios_select_propio_o_admin on usuarios for select to authenticated
  using (id = (select auth.uid()) or (select private.mi_rol()) in ('admin', 'gerente'));

create policy usuarios_insert_admin on usuarios for insert to authenticated
  with check ((select private.mi_rol()) = 'admin');

create policy usuarios_update_admin on usuarios for update to authenticated
  using      ((select private.mi_rol()) = 'admin')
  with check ((select private.mi_rol()) = 'admin');

create policy usuarios_delete_admin on usuarios for delete to authenticated
  using ((select private.mi_rol()) = 'admin');

-- ---------------------------------------------------------------- GRANT
-- El proyecto tiene desactivado "exponer tablas nuevas automáticamente", y desde el 30-10-2026
-- Supabase lo hace obligatorio para todos. Sin estos GRANT la app responde que la tabla no
-- existe en el schema cache. GRANT es permiso de tabla y RLS es de fila: el admin entra por el
-- mismo rol authenticated que el técnico, así que el rol necesita el privilegio y RLS decide
-- quién lo ejerce. Nada se otorga a anon: no hay parte pública en este sistema.
grant usage on schema public to authenticated;

grant select on
  public.camiones, public.clientes, public.sucursales,
  public.productos, public.cilindros, public.usuarios, public.movimientos
  to authenticated;

grant insert, update, delete on
  public.camiones, public.clientes, public.sucursales,
  public.productos, public.cilindros, public.usuarios
  to authenticated;

-- movimientos no recibe delete a propósito
grant insert, update on public.movimientos to authenticated;

grant usage, select on sequence folio_operacion_seq to authenticated;
