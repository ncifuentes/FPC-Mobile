-- Migración 12 · Sprint 5 · Tarjeta: Asignar folio_operacion desde la app (un folio por despacho)
--
-- EL PROBLEMA. `movimientos.folio_operacion` existe desde el Sprint 3 con su secuencia, pero no
-- había forma de pedir un folio desde la aplicación: PostgREST no expone `nextval`, y el técnico
-- tampoco tiene política de UPDATE sobre `movimientos` —solo el administrador la tiene—, así que
-- ni siquiera podría escribirlo. La documentación de la API lo dejó anotado como pendiente.
--
-- POR QUE EL FOLIO SE ASIGNA AL SINCRONIZAR Y NO AL REGISTRAR. El teléfono trabaja sin señal: no
-- puede pedirle un número a una secuencia que vive en el servidor, y dos teléfonos inventando
-- correlativos por su cuenta chocarían. La app agrupa el despacho localmente —son los movimientos
-- de una misma visita a un cliente— y al sincronizar pide UN folio para el grupo completo.
--
-- POR QUE RECIBE UNA LISTA Y NO DEVUELVE UN NUMERO SUELTO. Si la función solo entregara el
-- siguiente valor, la app tendría que escribirlo después, y no puede: no tiene permiso de UPDATE.
-- Además quedaría la ventana de que se pida un folio y la escritura falle, quemando correlativos
-- y dejando huecos en la numeración que el cliente usa para seguir un despacho.
--
-- IDEMPOTENCIA. Es la misma exigencia que el resto de la sincronización: la app reintenta cuando
-- la conexión se corta a medias. Si los movimientos ya tienen folio, se devuelve el que tienen y
-- no se consume uno nuevo. Reintentar no numera dos veces el mismo despacho.
--
-- POR QUE `SECURITY DEFINER`, a diferencia de la función del informe. Acá es necesario: el
-- técnico no tiene UPDATE sobre `movimientos` y no se le va a dar, porque eso le permitiría
-- editar cualquier campo de sus movimientos y el diseño dice que las correcciones las hace la
-- administración. La función escribe en su nombre pero **solo** la columna del folio, y comprueba
-- ella misma la propiedad de las filas. El `search_path` queda fijo, que en una función DEFINER
-- sí es indispensable.

create or replace function public.asignar_folio_despacho(p_uuids uuid[])
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_rol        rol_usuario;
  v_pedidos    int  := coalesce(cardinality(p_uuids), 0);
  v_encontrados int;
  v_propios    int;
  v_sucursales int;
  v_folios     bigint[];
  v_folio      bigint;
begin
  if v_uid is null then
    raise exception 'No hay sesión iniciada';
  end if;

  select u.rol into v_rol from public.usuarios u where u.id = v_uid;
  if v_rol is null or v_rol not in ('tecnico', 'admin') then
    raise exception 'Solo un técnico o un administrador puede asignar folio';
  end if;

  if v_pedidos = 0 then
    raise exception 'No se recibió ningún movimiento';
  end if;

  -- Todos los movimientos tienen que haber llegado ya al servidor. Si falta alguno, es que el
  -- lote se sincronizó a medias: numerar el despacho incompleto dejaría movimientos de la misma
  -- visita con folios distintos.
  select count(*), count(*) filter (where m.usuario_id = v_uid),
         count(distinct m.sucursal_id)
    into v_encontrados, v_propios, v_sucursales
    from public.movimientos m
   where m.uuid_local = any(p_uuids);

  if v_encontrados <> v_pedidos then
    raise exception 'Faltan % movimientos en el servidor: sincronice el lote completo antes de pedir folio',
                    v_pedidos - v_encontrados;
  end if;

  -- Un técnico solo numera lo suyo. El administrador puede numerar un despacho ajeno al corregir.
  if v_rol = 'tecnico' and v_propios <> v_encontrados then
    raise exception 'No se puede asignar folio a movimientos de otro usuario';
  end if;

  -- Un folio es UN despacho a UN cliente. Si vienen de sucursales distintas, o alguno es una
  -- carga al camión (que no tiene sucursal), la agrupación está mal armada en la app.
  if exists (select 1 from public.movimientos m
              where m.uuid_local = any(p_uuids) and m.sucursal_id is null) then
    raise exception 'Un folio agrupa entregas y retiros en un cliente: las cargas al camión no llevan folio';
  end if;
  if v_sucursales > 1 then
    raise exception 'Los movimientos son de % sucursales distintas: un folio corresponde a un solo despacho',
                    v_sucursales;
  end if;

  -- Idempotencia: si ya se numeró, se devuelve el mismo folio sin consumir otro.
  select array_agg(distinct m.folio_operacion)
    into v_folios
    from public.movimientos m
   where m.uuid_local = any(p_uuids) and m.folio_operacion is not null;

  if v_folios is not null then
    if cardinality(v_folios) > 1 then
      raise exception 'Estos movimientos ya tienen folios distintos (%): hay que corregirlos a mano', v_folios;
    end if;
    if (select count(*) from public.movimientos m
         where m.uuid_local = any(p_uuids) and m.folio_operacion is null) > 0 then
      -- Numeración a medias: se completa con el folio que ya existía.
      update public.movimientos set folio_operacion = v_folios[1]
       where uuid_local = any(p_uuids) and folio_operacion is null;
    end if;
    return v_folios[1];
  end if;

  v_folio := nextval('public.folio_operacion_seq');
  update public.movimientos set folio_operacion = v_folio where uuid_local = any(p_uuids);
  return v_folio;
end;
$$;

comment on function public.asignar_folio_despacho(uuid[]) is
  'Asigna un correlativo de despacho a un grupo de movimientos ya sincronizados y devuelve el '
  'folio. Idempotente: reintentar devuelve el mismo folio sin consumir otro. El técnico solo '
  'puede numerar movimientos propios, de una misma sucursal y que no sean cargas al camión.';

revoke execute on function public.asignar_folio_despacho(uuid[]) from public, anon;
grant  execute on function public.asignar_folio_despacho(uuid[]) to authenticated;
