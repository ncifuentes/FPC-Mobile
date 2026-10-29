-- Búsqueda tolerante del número de serie escaneado o tipeado: ignora mayúsculas y espacios.
-- El índice único además impide cargar el mismo envase escrito de dos formas (S878221 / s878221).
alter table public.cilindros
  add column if not exists serie_normalizada text
  generated always as (upper(regexp_replace(numero_serie, '\s', '', 'g'))) stored;
comment on column public.cilindros.serie_normalizada is 'Serie en mayúsculas y sin espacios: la usa la app para buscar lo escaneado o tipeado.';
create unique index if not exists cilindros_serie_normalizada_key on public.cilindros (serie_normalizada);
