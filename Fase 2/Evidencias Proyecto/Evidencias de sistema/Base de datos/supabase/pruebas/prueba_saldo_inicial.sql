-- Pruebas del saldo inicial (migración 20261105120000_saldos_iniciales) · 05-11-2026
--
-- Se ejecuta contra la base enlazada SIN dejar rastro: todo corre en un único bloque que termina
-- SIEMPRE con `raise exception`, así que la transacción se revierte entera (movimientos de prueba,
-- auditoría, cambios de estado). El resultado viaja en el mensaje de ese error:
--
--   npx supabase db query --remote --yes -f supabase/pruebas/prueba_saldo_inicial.sql
--
-- La salida esperada es un error «RESULTADO_PRUEBAS {...}» con los siete casos en PASA.
-- No usa datos literales de clientes: elige los cilindros y sucursales por sus características.

do $$
declare
  v_res     jsonb := '{}'::jsonb;
  v_admin   uuid;
  v_tec     uuid;
  v_cam     uuid;
  v_x       uuid;   -- cilindro con saldo, único cilindro de su cliente
  v_cli_a   uuid;
  v_suc_a   uuid;
  v_desde   timestamptz;
  v_cli_b   uuid;   -- cliente sin cilindros ni movimientos
  v_suc_b   uuid;
  v_y       uuid;   -- cilindro sin saldo ni movimientos
  v_mov1    uuid := gen_random_uuid();
  v_mov2    uuid := gen_random_uuid();
  v_c       record;
  v_inf     record;
  v_antes   text;
  v_despues text;
  v_ok      boolean;
begin
  -- ---------------------------------------------------------------- preparación
  select id into v_admin from public.usuarios where rol = 'admin' and activo order by creado_en limit 1;
  select id into v_tec   from public.usuarios where rol = 'tecnico' order by creado_en limit 1;
  select id into v_cam   from public.camiones order by creado_en limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select si.cilindro_id, s.cliente_id, si.sucursal_id, si.desde
    into v_x, v_cli_a, v_suc_a, v_desde
    from public.saldos_iniciales si
    join public.sucursales s on s.id = si.sucursal_id
    join public.cilindros c on c.id = si.cilindro_id
   where not c.es_propiedad_cliente
     and not exists (select 1 from public.movimientos m where m.cilindro_id = si.cilindro_id)
     and (select count(*) from public.cilindros k join public.sucursales ks on ks.id = k.sucursal_actual_id
           where ks.cliente_id = s.cliente_id) = 1
     and not exists (select 1 from public.movimientos m join public.sucursales ms on ms.id = m.sucursal_id
                      where ms.cliente_id = s.cliente_id)
   order by si.cilindro_id limit 1;

  select s.cliente_id, s.id into v_cli_b, v_suc_b
    from public.sucursales s
   where s.es_principal and s.activo and s.cliente_id <> v_cli_a
     and not exists (select 1 from public.cilindros k join public.sucursales ks on ks.id = k.sucursal_actual_id
                      where ks.cliente_id = s.cliente_id)
     and not exists (select 1 from public.movimientos m join public.sucursales ms on ms.id = m.sucursal_id
                      where ms.cliente_id = s.cliente_id)
   order by s.id limit 1;

  select c.id into v_y from public.cilindros c
   where c.estado = 'en_planta' and not c.es_propiedad_cliente
     and not exists (select 1 from public.saldos_iniciales si where si.cilindro_id = c.id)
     and not exists (select 1 from public.movimientos m where m.cilindro_id = c.id)
   order by c.id limit 1;

  if v_admin is null or v_tec is null or v_cam is null or v_x is null or v_cli_b is null or v_y is null then
    raise exception 'Faltan datos para preparar la prueba';
  end if;

  select md5(string_agg(id::text || estado || coalesce(sucursal_actual_id::text, '')
                        || coalesce(en_cliente_desde::text, ''), '|' order by id))
    into v_antes from public.cilindros;

  -- ---------------------------------------------------------------- caso 1
  select * into v_c from public.cilindros where id = v_x;
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-11-01', date '2026-11-30');
  v_ok := v_c.estado = 'en_cliente' and v_c.sucursal_actual_id = v_suc_a and v_inf.e = 1 and v_inf.d = 30;
  v_res := v_res || jsonb_build_object('1_saldo_sin_movimientos', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'nov_envases', v_inf.e, 'nov_dias', v_inf.d));
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-10-01', date '2026-10-31');
  v_res := v_res || jsonb_build_object('1b_octubre_desde_27', jsonb_build_object(
    'resultado', case when v_inf.e = 1 and v_inf.d = 5 then 'PASA' else 'FALLA' end,
    'oct_envases', v_inf.e, 'oct_dias', v_inf.d));

  -- ---------------------------------------------------------------- caso 2
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov1, 'retiro', v_x, v_suc_a, v_tec, v_cam, '2026-11-10 12:00-03', 'manual');
  select * into v_c from public.cilindros where id = v_x;
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-11-01', date '2026-11-30');
  v_ok := v_c.estado = 'en_camion' and v_inf.e = 0 and v_inf.d = 9;
  v_res := v_res || jsonb_build_object('2_retiro_posterior', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'nov_envases', v_inf.e, 'nov_dias', v_inf.d));

  -- ---------------------------------------------------------------- caso 3
  delete from public.movimientos where uuid_local = v_mov1;
  select * into v_c from public.cilindros where id = v_x;
  v_ok := v_c.estado = 'en_cliente' and v_c.sucursal_actual_id = v_suc_a and v_c.en_cliente_desde = v_desde;
  v_res := v_res || jsonb_build_object('3_borrar_retiro_vuelve_al_saldo', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'desde', v_c.en_cliente_desde));

  -- ---------------------------------------------------------------- caso 4
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov1, 'retiro',  v_x, v_suc_a, v_tec, v_cam, '2026-11-10 12:00-03', 'manual'),
         (v_mov2, 'entrega', v_x, v_suc_b, v_tec, v_cam, '2026-11-15 12:00-03', 'manual');
  select * into v_c from public.cilindros where id = v_x;
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-11-01', date '2026-11-30');
  v_ok := v_c.estado = 'en_cliente' and v_c.sucursal_actual_id = v_suc_b and v_inf.e = 0 and v_inf.d = 9;
  v_res := v_res || jsonb_build_object('4a_cliente_original', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'nov_envases', v_inf.e, 'nov_dias', v_inf.d));
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_b, date '2026-11-01', date '2026-11-30');
  v_res := v_res || jsonb_build_object('4b_cliente_nuevo', jsonb_build_object(
    'resultado', case when v_inf.e = 1 and v_inf.d = 16 then 'PASA' else 'FALLA' end,
    'nov_envases', v_inf.e, 'nov_dias', v_inf.d));
  delete from public.movimientos where uuid_local in (v_mov1, v_mov2);

  -- ---------------------------------------------------------------- caso 5
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov1, 'retiro', v_x, v_suc_a, v_tec, v_cam, '2026-10-20 12:00-03', 'manual');
  select * into v_c from public.cilindros where id = v_x;
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-11-01', date '2026-11-30');
  v_ok := v_c.estado = 'en_cliente' and v_c.sucursal_actual_id = v_suc_a and v_c.en_cliente_desde = v_desde
          and v_inf.e = 1 and v_inf.d = 30;
  v_res := v_res || jsonb_build_object('5_movimiento_anterior_al_saldo', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'nov_dias', v_inf.d));
  delete from public.movimientos where uuid_local = v_mov1;

  -- ---------------------------------------------------------------- caso 7
  -- Un movimiento con fecha_evento IGUAL a `desde` también queda superado por el saldo.
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov1, 'retiro', v_x, v_suc_a, v_tec, v_cam, v_desde, 'manual');
  select * into v_c from public.cilindros where id = v_x;
  select coalesce(sum(envases), 0) e, coalesce(sum(dias), 0) d into v_inf
    from public.informe_envases_arrendados(v_cli_a, date '2026-11-01', date '2026-11-30');
  v_ok := v_c.estado = 'en_cliente' and v_c.sucursal_actual_id = v_suc_a and v_c.en_cliente_desde = v_desde
          and v_inf.e = 1 and v_inf.d = 30;
  v_res := v_res || jsonb_build_object('7_movimiento_igual_a_desde', jsonb_build_object(
    'resultado', case when v_ok then 'PASA' else 'FALLA' end,
    'estado', v_c.estado, 'nov_dias', v_inf.d));
  delete from public.movimientos where uuid_local = v_mov1;

  -- ---------------------------------------------------------------- caso 6
  v_ok := true;
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov1, 'carga', v_y, null, v_tec, v_cam, '2026-11-10 09:00-03', 'manual');
  v_ok := v_ok and (select estado = 'en_camion' from public.cilindros where id = v_y);
  insert into public.movimientos (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento, codigo_origen)
  values (v_mov2, 'entrega', v_y, v_suc_b, v_tec, v_cam, '2026-11-10 12:00-03', 'manual');
  v_ok := v_ok and (select estado = 'en_cliente' and sucursal_actual_id = v_suc_b
                           and en_cliente_desde = '2026-11-10 12:00-03' from public.cilindros where id = v_y);
  delete from public.movimientos where uuid_local = v_mov2;
  v_ok := v_ok and (select estado = 'en_camion' from public.cilindros where id = v_y);
  delete from public.movimientos where uuid_local = v_mov1;
  v_ok := v_ok and (select estado = 'en_planta' and sucursal_actual_id is null from public.cilindros where id = v_y);
  -- y el recálculo de TODO el parque con la regla nueva deja todo como estaba
  perform private.recalcular_estado_cilindro(c.id) from public.cilindros c;
  select md5(string_agg(id::text || estado || coalesce(sucursal_actual_id::text, '')
                        || coalesce(en_cliente_desde::text, ''), '|' order by id))
    into v_despues from public.cilindros;
  v_res := v_res || jsonb_build_object('6_sin_saldo_igual_que_antes', jsonb_build_object(
    'resultado', case when v_ok and v_antes = v_despues then 'PASA' else 'FALLA' end,
    'ciclo_carga_entrega_borrado', v_ok, 'parque_sin_cambios', v_antes = v_despues));

  -- Siempre se revierte: nada de esta prueba queda en la base.
  -- El conteo va primero porque el CLI puede truncar el mensaje largo.
  raise exception 'RESULTADO_PRUEBAS pasan % de % · %',
    (select count(*) from jsonb_each(v_res) e where e.value->>'resultado' = 'PASA'),
    (select count(*) from jsonb_each(v_res)), v_res;
end $$;
