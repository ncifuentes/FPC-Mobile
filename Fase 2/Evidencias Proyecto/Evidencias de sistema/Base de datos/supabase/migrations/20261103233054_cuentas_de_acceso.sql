-- Cuentas de acceso para el mantenedor de usuarios de la plataforma web (HU-14) · 03-11-2026
--
-- EL PROBLEMA. El perfil de un usuario (public.usuarios: nombre, rol, camión) cuelga de su cuenta
-- de Supabase Auth (auth.users), pero el navegador no puede leer auth.users: ni el correo de cada
-- usuario ni qué cuentas existen todavía sin perfil. Sin eso, el administrador no tiene cómo
-- asignarle un perfil a una cuenta recién creada salvo copiando su UUID a mano.
--
-- LA SOLUCION. Una función de solo lectura que entrega, para admin y gerente, el id y el correo de
-- cada cuenta y si ya tiene perfil. No crea ni modifica cuentas: eso sigue haciéndose en el panel
-- de Supabase (Authentication → Add user), porque requiere la clave de servicio y no debe vivir en
-- el navegador. Tampoco expone nada más de auth.users (ni contraseñas ni metadatos).
--
-- POR QUE SECURITY DEFINER. Es la única forma de leer auth.users desde el rol authenticated. Por
-- eso la función comprueba el rol ella misma y fija el search_path. El advisor de Supabase la
-- lista como «SECURITY DEFINER ejecutable por authenticated», igual que asignar_folio_despacho y
-- registrar_comprobante: es intencional, y la guarda de rol es la que la protege.
--
-- Aplicada en remoto el 03-11-2026.

create or replace function public.cuentas_de_acceso()
returns table (
  id            uuid,
  correo        text,
  tiene_perfil  boolean,
  creada_en     timestamptz,
  ultimo_ingreso timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if (select private.mi_rol()) is distinct from 'admin'
     and (select private.mi_rol()) is distinct from 'gerente' then
    raise exception using errcode = '42501',
      message = 'Solo admin o gerente pueden consultar las cuentas de acceso';
  end if;

  return query
  select a.id,
         a.email::text,
         exists (select 1 from public.usuarios u where u.id = a.id),
         a.created_at,
         a.last_sign_in_at
    from auth.users a
   order by a.created_at;
end;
$$;

comment on function public.cuentas_de_acceso() is
  'Correo de cada cuenta de Supabase Auth y si ya tiene perfil en usuarios. Solo admin y gerente. '
  'Lo usa el mantenedor de usuarios de la web para mostrar correos y asignar perfil a cuentas nuevas.';

revoke execute on function public.cuentas_de_acceso() from public, anon;
grant  execute on function public.cuentas_de_acceso() to authenticated;
