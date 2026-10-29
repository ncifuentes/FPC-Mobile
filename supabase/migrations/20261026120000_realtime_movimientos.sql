-- Migración 09 · Sprint 4 · Tarjeta: Habilitar Realtime sobre movimientos
--
-- Para que el tablero del dia de la plataforma web (Sprint 6) se actualice sin que nadie recargue
-- la pagina. La app movil del tecnico NO usa Realtime: trabaja contra su cola local.
--
-- DECISION NO OBVIA — el bloque condicional. La publicacion supabase_realtime la crea la
-- plataforma y no existe en una base creada con `supabase db reset` sin el stack local completo.
-- Un `alter publication` pelado fallaria ahi y rompería la reproducibilidad de las migraciones,
-- que es parte de lo que se evalua. Por eso se consulta el catalogo antes.
--
-- ⚠️ HABILITARLO ES LA PARTE FACIL. Lo que esta tarjeta exige de verdad es VERIFICAR QUE RLS SE
-- APLIQUE TAMBIEN EN REALTIME. Es el punto por donde el aislamiento entre tecnicos se puede
-- filtrar sin que nadie lo note: si un tecnico se suscribe y recibe los movimientos de todos, las
-- politicas que se probaron en el Sprint 3 sirvieron de poco, porque la fuga ocurre por el canal
-- de tiempo real y no por la consulta. La prueba va en supabase/PRUEBAS_ESQUEMA.md: dos sesiones
-- suscritas al mismo canal con JWT de tecnicos distintos; el tecnico B no debe recibir ningun
-- evento de los movimientos del tecnico A.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'La publicacion supabase_realtime no existe en esta base: nada que hacer.';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movimientos'
  ) then
    raise notice 'movimientos ya estaba en la publicacion supabase_realtime.';
    return;
  end if;

  execute 'alter publication supabase_realtime add table public.movimientos';
  raise notice 'movimientos agregada a la publicacion supabase_realtime.';
end $$;

-- replica identity full para que los eventos de UPDATE y DELETE lleguen con la fila completa y no
-- solo con la clave primaria. Sin esto el tablero recibe un UPDATE sin saber que cambio.
alter table public.movimientos replica identity full;
