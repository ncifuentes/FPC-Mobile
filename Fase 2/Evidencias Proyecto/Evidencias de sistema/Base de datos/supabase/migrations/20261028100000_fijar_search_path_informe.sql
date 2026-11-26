-- Migración 11 · Sprint 4 · Endurecimiento: fijar el search_path del informe
--
-- El advisor de seguridad de Supabase marcó `public.informe_envases_arrendados` con «Function
-- Search Path Mutable» (WARN, categoría SECURITY) apenas se aplicó la migración 09. El Sprint 3
-- había cerrado con el advisor sin hallazgos, y la función nueva lo reabrió.
--
-- QUE DICE LA REGLA. Una función sin `search_path` fijo resuelve los nombres sin calificar con el
-- search_path de quien la llama. Si alguien puede crear objetos en un schema que quede antes que
-- `public` —típicamente `pg_temp`, donde cualquiera crea tablas temporales—, puede lograr que la
-- función lea una tabla falsa.
--
-- QUE SE COMPROBO (27-10-2026). Se intentó el ataque antes de aplicar esta migración: como un
-- técnico, se creó una tabla temporal `usuarios` que lo declaraba admin y se puso `pg_temp`
-- delante de `public` en el search_path de la sesión. **La función lo rechazó igual.** El motivo
-- es que su cuerpo califica el schema en todas las referencias a tablas (`public.usuarios`,
-- `public.movimientos`, `public.sucursales`, `public.cilindros`, `public.productos`,
-- `auth.uid()`), así que no hay nombre que secuestrar. La prueba se repitió después de aplicar
-- la migración, con el mismo resultado.
--
-- ENTONCES POR QUE SE APLICA. No para cerrar un agujero: no hay agujero hoy. Por tres razones
-- concretas:
--   1. Defensa en profundidad. Hoy el cuerpo está calificado porque se escribió así; nada obliga
--      a que la próxima edición lo esté. Con el search_path fijo, un descuido futuro no se
--      convierte en vulnerabilidad.
--   2. Mantener cierta la afirmación de la evidencia. El informe del Sprint 3 declara «advisor
--      de seguridad sin hallazgos». Si se deja el WARN, esa frase deja de ser verdadera y hay
--      que explicar un hallazgo abierto en la defensa.
--   3. Cuesta una línea.
--
-- POR QUE UN ALTER Y NO REESCRIBIR LA FUNCION. `alter function ... set search_path` fija el
-- camino sin volver a declarar el cuerpo: la definición sigue viviendo en un solo lugar, la
-- migración 09, y el diff queda en una línea.
--
-- POR QUE `public, pg_temp` Y NO `''`. El cuerpo declara una variable de tipo `rol_usuario` sin
-- calificar, y con el camino vacío ese tipo no resolvería. Lo que da la seguridad no es excluir
-- `public` —que es donde viven las tablas de verdad— sino que **`pg_temp` quede al final**: así
-- una tabla temporal nunca puede tapar a una real.

alter function public.informe_envases_arrendados(uuid, date, date, date)
  set search_path = public, pg_temp;

do $$
declare
  v_config text[];
begin
  select p.proconfig into v_config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'informe_envases_arrendados';

  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'El search_path de informe_envases_arrendados no quedó fijado: %', v_config;
  end if;

  raise notice 'search_path fijado: %', v_config;
end $$;
