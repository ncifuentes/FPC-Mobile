-- Migración 06 · Sprint 3 · Tarjeta: Políticas RLS por rol (endurecimiento)
--
-- Cierra el único hallazgo del advisor de seguridad de Supabase.
--
-- `public.rls_auto_enable()` NO es nuestra: la crea la plataforma cuando el proyecto tiene
-- activada la opción «habilitar RLS automáticamente en tablas nuevas». Es SECURITY DEFINER y
-- queda con EXECUTE para `anon` y `authenticated`, que es lo que el advisor marca: una función
-- con privilegios del dueño, alcanzable desde la API REST por cualquier visitante.
--
-- Revocar el EXECUTE no desactiva la función ni la opción del proyecto: el mecanismo que la usa
-- es un event trigger que corre con los privilegios del dueño, no con el rol del cliente.
--
-- DECISIÓN NO OBVIA — el bloque condicional. La función solo existe en el proyecto de la nube,
-- no en una base creada con `supabase db reset`. Un `revoke` pelado fallaría ahí y rompería la
-- reproducibilidad de las migraciones, que es justamente lo que se evalúa. Por eso se consulta
-- el catálogo antes y, si la función no está, la migración no hace nada y sigue.
--
-- Si en el futuro Supabase vuelve a crear la función o a otorgar el permiso, el advisor puede
-- marcarlo de nuevo. Es un objeto de la plataforma y no está bajo nuestro control.

do $$
declare
  v_funcion oid;
begin
  select p.oid
    into v_funcion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'rls_auto_enable';

  if v_funcion is null then
    raise notice 'public.rls_auto_enable() no existe en esta base: nada que revocar.';
    return;
  end if;

  execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  raise notice 'Revocado EXECUTE sobre public.rls_auto_enable() a anon, authenticated y public.';
end $$;
