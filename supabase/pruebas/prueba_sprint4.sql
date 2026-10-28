-- =====================================================================================
-- Pruebas del Sprint 4 · funcion informe_envases_arrendados
--
-- Caso de referencia: informe real "Detalles de Alquiler de Cilindros" (WESEH0) emitido
-- por KAME ONE el 26/10/2026 para el cliente 000298 AGROINDUSTRIA SAN JAVIER LIMIT,
-- periodo 01/10/2026 a 31/10/2026. El informe trae el detalle cilindro por cilindro, asi
-- que se puede reproducir linea por linea y no solo el total.
--
-- Todo corre dentro de una transaccion que se revierte: no queda ningun dato de prueba.
-- =====================================================================================
\set ON_ERROR_STOP on
\pset format aligned
\timing off
begin;

insert into auth.users(id) values (gen_random_uuid()),(gen_random_uuid());

insert into clientes(rut,nombre,codigo_kame)
  values ('76111222-3','AGROINDUSTRIA SAN JAVIER LIMIT (PRUEBA)','298') returning id \gset cli_
select set_config('test.cli', :'cli_id', false) \gset descartar1_

insert into sucursales(cliente_id,nombre,direccion,comuna,ciudad,region,es_principal)
  values (:'cli_id','Planta','Camino San Javier s/n','San Javier','Linares','Maule',true)
  returning id \gset suc_
insert into camiones(patente,capacidad_cilindros) values ('PRUE98',40) returning id \gset cam_
insert into usuarios(id,nombre,rol)
  select id,'Admin Prueba','admin' from auth.users order by id limit 1 returning id \gset adm_
insert into usuarios(id,nombre,rol)
  select id,'Tecnico Prueba','tecnico' from auth.users where id <> :'adm_id' limit 1 returning id \gset tec_

-- Las once lineas del informe, con el cilindro real del parque que les corresponde.
create temporary table lineas(serie text, entrega date, devolucion date);
insert into lineas values
  ('21B0132080'  ,'2026-10-20', null),
  ('732801051'   ,'2026-07-07','2026-10-07'),
  ('B586118'     ,'2026-07-31', null),
  ('P07586157'   ,'2026-09-09', null),
  ('2994032'     ,'2026-10-20', null),
  ('732803882A'  ,'2026-09-09','2026-10-07'),
  ('732804164'   ,'2026-08-26','2026-10-07'),
  ('732804179'   ,'2026-10-20', null),
  ('732804195'   ,'2026-09-21','2026-10-07'),
  ('81961'       ,'2026-09-09','2026-10-19'),
  ('CL.732802351','2026-09-21','2026-10-19');

select 'Cilindros del informe presentes en el parque: '||count(*)||' de 11 (esperado 11)' as comprobacion
  from lineas l join cilindros c on c.numero_serie = l.serie;

insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'entrega',c.id,:'suc_id',:'adm_id',:'cam_id',l.entrega::timestamptz,'manual'
  from lineas l join cilindros c on c.numero_serie=l.serie;
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'retiro',c.id,:'suc_id',:'adm_id',:'cam_id',l.devolucion::timestamptz,'manual'
  from lineas l join cilindros c on c.numero_serie=l.serie where l.devolucion is not null;

select set_config('request.jwt.claim.sub', :'adm_id', true) \gset descartar2_
set local role authenticated;

\echo ''
\echo '=== CASO 1 · reproduce el informe real de octubre ==================================='
\echo '    esperado: RENC53 3 envases / 74 dias | RENC54 0 / 6 | RENN57 2 / 78 | total 5 / 158'
select codigo_arriendo, producto, envases, dias
  from informe_envases_arrendados(:'cli_id','2026-10-01','2026-10-31');
select 'TOTAL envases='||sum(envases)||' dias='||sum(dias) as total
  from informe_envases_arrendados(:'cli_id','2026-10-01','2026-10-31');

\echo ''
\echo '=== CASO 2 · corte al 15/10 ========================================================'
\echo '    esperado: RENC53 2 / 30 | RENC54 0 / 6 | RENN57 2 / 48 | total 4 / 84'
\echo '    a esa fecha, las entregas del 20/10 no ocurrieron y las devoluciones del 19/10 tampoco'
select codigo_arriendo, envases, dias
  from informe_envases_arrendados(:'cli_id','2026-10-01','2026-10-31','2026-10-15');

\echo ''
\echo '=== CASO 3 · septiembre, sin devoluciones dentro del periodo ======================='
\echo '    esperado: RENC53 2 / 52 | RENC54 1 / 30 | RENN57 5 / 94'
select codigo_arriendo, envases, dias
  from informe_envases_arrendados(:'cli_id','2026-09-01','2026-09-30');

\echo ''
\echo '=== CASO 4 · un envase de categoria PRO no se arrienda ============================='
\echo '    esperado: el total sigue siendo 5 envases y 158 dias'
reset role;
insert into movimientos(uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,codigo_origen)
select gen_random_uuid(),'entrega',c.id,:'suc_id',:'adm_id',:'cam_id','2026-10-01'::timestamptz,'manual'
  from cilindros c join productos p on p.id=c.producto_id
 where p.envase_codigo='PRO' and c.es_propiedad_cliente limit 1;
set local role authenticated;
select 'TOTAL con un PRO entregado: envases='||sum(envases)||' dias='||sum(dias) as resultado
  from informe_envases_arrendados(:'cli_id','2026-10-01','2026-10-31');

\echo ''
\echo '=== CASO 5 · un tecnico no puede pedir el informe =================================='
reset role;
select set_config('request.jwt.claim.sub', :'tec_id', true) \gset descartar3_
set local role authenticated;
do $$
begin
  perform * from informe_envases_arrendados(current_setting('test.cli')::uuid,'2026-10-01','2026-10-31');
  raise exception 'FALLO: el tecnico obtuvo el informe';
exception when sqlstate 'P0001' then
  if sqlerrm like '%solo esta disponible para admin o gerente%'
    then raise notice 'OK rechazado: %', sqlerrm;
    else raise;
  end if;
end $$;

\echo ''
\echo '=== CASO 6 · periodo invertido y corte fuera del periodo ==========================='
reset role;
select set_config('request.jwt.claim.sub', :'adm_id', true) \gset descartar4_
set local role authenticated;
do $$
begin
  perform * from informe_envases_arrendados(current_setting('test.cli')::uuid,'2026-10-31','2026-10-01');
  raise exception 'FALLO: acepto un periodo invertido';
exception when sqlstate 'P0001' then raise notice 'OK rechazado: %', sqlerrm;
end $$;
do $$
begin
  perform * from informe_envases_arrendados(current_setting('test.cli')::uuid,'2026-10-01','2026-10-31','2026-11-20');
  raise exception 'FALLO: acepto un corte fuera del periodo';
exception when sqlstate 'P0001' then raise notice 'OK rechazado: %', sqlerrm;
end $$;

reset role;
rollback;

\echo ''
\echo '=== LIMPIEZA · no debe quedar ningun dato de prueba ================================'
select (select count(*) from movimientos)                                   as movimientos,
       (select count(*) from clientes where rut='76111222-3')               as clientes_prueba,
       (select count(*) from camiones where patente='PRUE98')               as camiones_prueba,
       (select count(*) from usuarios where nombre like '% Prueba')         as usuarios_prueba;
