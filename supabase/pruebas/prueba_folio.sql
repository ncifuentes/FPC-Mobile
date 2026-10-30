\set ON_ERROR_STOP on
\pset format aligned
begin;
insert into auth.users(id) values (gen_random_uuid()),(gen_random_uuid()),(gen_random_uuid());
insert into clientes(rut,nombre) values ('11111111-1','Cliente Folio') returning id \gset cli_
insert into sucursales(cliente_id,nombre,direccion,es_principal)
  values (:'cli_id','PRINCIPAL','Calle 1',true) returning id \gset s1_
insert into sucursales(cliente_id,nombre,direccion,es_principal)
  values (:'cli_id','BODEGA','Calle 2',false) returning id \gset s2_
insert into camiones(patente,capacidad_cilindros) values ('FOLIO1',30) returning id \gset cam_
insert into usuarios(id,nombre,rol) select id,'Tec A','tecnico' from auth.users order by id limit 1 returning id \gset ta_
insert into usuarios(id,nombre,rol) select id,'Tec B','tecnico' from auth.users where id<>:'ta_id' order by id limit 1 returning id \gset tb_
insert into usuarios(id,nombre,rol) select id,'Admin','admin' from auth.users where id not in (:'ta_id',:'tb_id') limit 1 returning id \gset ad_

create temporary table t(u uuid);
insert into t select gen_random_uuid() from generate_series(1,4);
select array_agg(u) as arr from t \gset
\set m1 '(select u from t order by u limit 1 offset 0)'

-- 3 entregas de Tec A en la sucursal 1, 1 retiro de Tec A en la misma, 1 entrega de Tec B,
-- 1 entrega de Tec A en OTRA sucursal, 1 carga sin sucursal.
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'entrega',c.id,:'s1_id',:'ta_id',:'cam_id',now(),'manual'
  from cilindros c order by c.numero_serie limit 3;
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'entrega',c.id,:'s2_id',:'ta_id',:'cam_id',now(),'manual'
  from cilindros c order by c.numero_serie offset 3 limit 1;
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'entrega',c.id,:'s1_id',:'tb_id',:'cam_id',now(),'manual'
  from cilindros c order by c.numero_serie offset 4 limit 1;
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'carga',c.id,null,:'ta_id',:'cam_id',now(),'manual'
  from cilindros c order by c.numero_serie offset 5 limit 1;

select m.uuid_local as mov_b from movimientos m where m.usuario_id = :'tb_id' limit 1 \gset
select set_config('t.movb', :'mov_b', false) \gset d0_
select set_config('t.a', :'ta_id', false) \gset d1_
select set_config('t.b', :'tb_id', false) \gset d2_

\echo ''
\echo '--- CASO 1 · tecnico A numera sus 3 entregas de la sucursal 1 -> debe dar un folio'
select set_config('request.jwt.claim.sub', :'ta_id', true) \gset d3_
set local role authenticated;
select public.asignar_folio_despacho(
  array(select m.uuid_local from movimientos m
         where m.usuario_id = current_setting('t.a')::uuid and m.sucursal_id = :'s1_id'
           and m.tipo='entrega')) as folio_1 \gset
\echo ''
\echo '--- CASO 2 · reintento con los mismos -> MISMO folio, no consume otro'
select public.asignar_folio_despacho(
  array(select m.uuid_local from movimientos m
         where m.usuario_id = current_setting('t.a')::uuid and m.sucursal_id = :'s1_id'
           and m.tipo='entrega')) as folio_2 \gset
select :'folio_1' as primera_llamada, :'folio_2' as reintento,
       case when :'folio_1' = :'folio_2' then 'OK idempotente' else 'FALLO' end as resultado;

\echo ''
\echo '--- CASO 3 · tecnico A intenta numerar el movimiento de B'
do $$
declare v bigint;
begin
  -- El uuid se capturó antes de cambiar de rol: si se arma la lista desde la sesión del
  -- técnico, RLS la deja vacía y la prueba aprueba sin haber probado nada.
  select public.asignar_folio_despacho(array[current_setting('t.movb')::uuid]) into v;
  raise exception 'FALLO: numero un movimiento ajeno (folio %)', v;
exception when sqlstate 'P0001' then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '--- CASO 4 · dos sucursales distintas en el mismo folio'
do $$
declare v bigint;
begin
  select public.asignar_folio_despacho(array(
    select m.uuid_local from public.movimientos m
     where m.usuario_id = current_setting('t.a')::uuid and m.sucursal_id is not null)) into v;
  raise exception 'FALLO: acepto dos sucursales (folio %)', v;
exception when sqlstate 'P0001' then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '--- CASO 5 · incluir una carga al camion'
do $$
declare v bigint;
begin
  select public.asignar_folio_despacho(array(
    select m.uuid_local from public.movimientos m
     where m.usuario_id = current_setting('t.a')::uuid and m.tipo='carga')) into v;
  raise exception 'FALLO: acepto una carga (folio %)', v;
exception when sqlstate 'P0001' then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '--- CASO 6 · un uuid que no llego al servidor'
do $$
declare v bigint;
begin
  select public.asignar_folio_despacho(array[gen_random_uuid()]) into v;
  raise exception 'FALLO: acepto un uuid inexistente (folio %)', v;
exception when sqlstate 'P0001' then raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '--- CASO 7 · el tecnico sigue SIN poder editar otra columna (la DEFINER no abrio la puerta)'
do $$
declare n int;
begin
  update public.movimientos set documento_referencia = 'hackeado'
   where usuario_id = current_setting('t.a')::uuid;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'OK: 0 filas afectadas, RLS sigue bloqueando el UPDATE directo';
  else raise exception 'FALLO: el tecnico edito % filas', n; end if;
end $$;

reset role;
rollback;
