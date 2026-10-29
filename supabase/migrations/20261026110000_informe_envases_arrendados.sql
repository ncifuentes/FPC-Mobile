-- Migración 08 · Sprint 4 · Tarjeta: Función SQL: informe mensual de envases arrendados
--
-- Es el entregable que el cliente va a mirar. Reemplaza el informe "Detalles de Alquiler de
-- Cilindros" (WESEH0) que FPC saca hoy de KAME ONE para facturar, y agrega lo que KAME no puede:
-- consultar con corte a una fecha arbitraria en vez de solo cerrar el mes completo.
--
-- POR QUE UNA FUNCION SQL Y NO UNA EDGE FUNCTION (decision del 23-10-2026): una Edge Function
-- corre en Deno, fuera de la base, y tendria que conectarse de vuelta para una consulta que
-- Postgres resuelve solo; ademas una funcion SQL hereda RLS automaticamente, mientras que a una
-- Edge Function habria que cuidar de no entregarle el rol de servicio.
--
-- ===========================================================================================
-- REGLA DE CALCULO — corregida el 27-10-2026 contra el informe real "Arriendos Balduzzi"
-- ===========================================================================================
-- El informe de octubre de 2026 del cliente 000298 trae el detalle cilindro por cilindro, lo que
-- permitio deducir la aritmetica exacta de KAME. Hasta el 26-10 esta funcion contaba los dias
-- inclusivos en ambos extremos, lo que daba bien para los envases retenidos pero se pasaba por un
-- dia en cada devolucion.
--
--   LA REGLA REAL ES: el dia final es EXCLUSIVO siempre.
--
--   dias = fin_exclusivo - inicio
--     inicio        = max(fecha de entrega, primer dia del periodo)
--                     La facturacion parte el dia 1: los meses anteriores ya se cobraron.
--     fin_exclusivo = min(fecha de devolucion, dia siguiente al corte, dia siguiente al periodo)
--                     Un envase aun en poder del cliente cuenta hasta el final; uno devuelto
--                     cuenta hasta el dia ANTERIOR a su devolucion.
--
--   LA FECHA DE CORTE ES UNA FOTO: al consultar con p_corte, nada posterior a esa fecha ha
--   ocurrido todavia. Una entrega posterior al corte no entra, y una devolucion posterior al
--   corte no se descuenta: a esa fecha el envase seguia en poder del cliente.
--
--   Verificado contra las once lineas del informe:
--     entregado 31/07, sin devolver, octubre  -> 01/10 a 01/11 = 31 dias
--     facturado 20/10, sin devolver, octubre  -> 20/10 a 01/11 = 12 dias
--     devuelto  07/10                         -> 01/10 a 07/10 =  6 dias  (no 7)
--     devuelto  19/10                         -> 01/10 a 19/10 = 18 dias  (no 19)
--
-- LA CANTIDAD DE ENVASES NO ES LA CANTIDAD QUE FACTURO DIAS. En el informe real, once cilindros
-- acumularon dias pero el pie dice "CILINDROS: 5", y la linea RENC54 dice "0 cilindros, 6 dias".
-- La cantidad son los envases TODAVIA EN PODER DEL CLIENTE al cierre del periodo. Se confirmo de
-- forma independiente con el listado de cilindros en clientes del 27-10: el cliente 298 figura
-- ahi con exactamente cinco cilindros, los mismos cinco que el informe deja sin fecha de
-- devolucion.
--
-- EL SISTEMA NO CALCULA MONTOS. El cliente pidio expresamente que la plataforma no maneje dinero:
-- esto entrega cantidad de envases y dias, y el traslada ese numero a su facturacion.
--
-- QUE SIGNIFICA es_propiedad_cliente: el criterio real de exclusion es la categoria PRO del
-- catalogo de envases, no la propiedad del cilindro. El cliente lo aclaro el 27-10: "todos los
-- envases, sean de nuestra propiedad o de un tercero, se cobra arriendo a los clientes, excepto
-- los cilindros que estan como categoria PRO". La columna se cargo justamente con los 89
-- cilindros PRO sin propietario, asi que el filtro es correcto; el nombre quedo desafortunado y
-- esta anotado en la bitacora de decisiones para corregirlo despues de la entrega.

create or replace function public.informe_envases_arrendados(
  p_cliente_id uuid,
  p_desde      date,
  p_hasta      date,
  p_corte      date default null
)
returns table (
  envase_codigo text,
  codigo_arriendo text,
  producto text,
  envases bigint,
  dias bigint
)
language plpgsql
stable
-- SECURITY INVOKER a proposito (es el default): asi RLS se aplica con los permisos de quien
-- consulta y la funcion no puede convertirse en una puerta lateral a los datos.
as $$
declare
  v_rol    rol_usuario;
  v_corte  date := coalesce(p_corte, p_hasta);
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Periodo invalido: p_desde=% p_hasta=%', p_desde, p_hasta;
  end if;

  if v_corte < p_desde or v_corte > p_hasta then
    raise exception 'La fecha de corte % debe caer dentro del periodo % a %',
                    v_corte, p_desde, p_hasta;
  end if;

  -- Guarda de rol. Se consulta usuarios directo y no private.mi_rol() porque esta funcion corre
  -- como invocador: un tecnico puede leer su propia fila de usuarios, pero no tiene permiso de
  -- uso sobre el schema private. Sin esta guarda, un tecnico obtendria un informe silenciosamente
  -- incompleto (solo sus movimientos), que es peor que un error.
  select u.rol into v_rol from public.usuarios u where u.id = (select auth.uid());
  if v_rol is null or v_rol not in ('admin', 'gerente') then
    raise exception 'El informe de arriendo solo esta disponible para admin o gerente';
  end if;

  return query
  with movs as (
    -- lead() sobre TODOS los movimientos del envase: cualquier movimiento posterior a una entrega
    -- significa que el envase dejo de estar en ese cliente, sea retiro o no.
    select m.cilindro_id,
           m.sucursal_id,
           m.tipo,
           m.fecha_evento,
           lead(m.fecha_evento) over (
             partition by m.cilindro_id order by m.fecha_evento, m.uuid_local
           ) as fin_estadia
      from public.movimientos m
  ),
  estadias as (
    select mv.cilindro_id,
           greatest(mv.fecha_evento::date, p_desde)                            as desde,
           -- Fin EXCLUSIVO, nunca mas alla del corte: si el envase sigue en poder del cliente
           -- el limite es el dia siguiente al corte, y una devolucion posterior al corte todavia
           -- no ocurrio para efectos de la consulta.
           least(coalesce(mv.fin_estadia::date, v_corte + 1), v_corte + 1)     as hasta_excl,
           -- Retenido: entregado el dia del corte o antes, y sin devolucion hasta esa fecha.
           (mv.fecha_evento::date <= v_corte
            and coalesce(mv.fin_estadia::date, v_corte + 1) > v_corte)         as retenido
      from movs mv
      join public.sucursales s on s.id = mv.sucursal_id
      join public.cilindros  c on c.id = mv.cilindro_id
     where mv.tipo = 'entrega'
       and s.cliente_id = p_cliente_id
       -- Los envases de categoria PRO se rastrean pero NO se arriendan.
       and c.es_propiedad_cliente = false
       -- descarta estadias que terminaron antes del periodo o que empiezan despues del corte
       and mv.fecha_evento::date <= v_corte
       and coalesce(mv.fin_estadia::date, v_corte + 1) > p_desde
  )
  select p.envase_codigo,
         p.codigo,
         p.nombre,
         count(distinct e.cilindro_id) filter (where e.retenido)::bigint,
         sum(greatest(0, e.hasta_excl - e.desde))::bigint
    from estadias e
    join public.cilindros c on c.id = e.cilindro_id
    join public.productos p on p.id = c.producto_id
   group by p.envase_codigo, p.codigo, p.nombre
   having sum(greatest(0, e.hasta_excl - e.desde)) > 0
   order by p.codigo;
end;
$$;

comment on function public.informe_envases_arrendados(uuid, date, date, date) is
  'Informe mensual de envases arrendados por cliente. Devuelve la cantidad de envases todavia en '
  'poder del cliente al cierre y el total de dias facturables, agrupados por tipo de envase. Los '
  'dias se cuentan con fin exclusivo, igual que el informe WESEH0 de KAME ONE. p_corte permite '
  'consultar a una fecha arbitraria dentro del periodo, que es la mejora concreta frente a KAME. '
  'Excluye los envases de categoria PRO.';

revoke execute on function public.informe_envases_arrendados(uuid, date, date, date) from public, anon;

grant  execute on function public.informe_envases_arrendados(uuid, date, date, date) to authenticated;
