/**
 * Limpieza del kit de prueba (Parte C · 05-11-2026).
 *
 * Borra los movimientos DE PRUEBA y sus comprobantes, y deja el kit listo para la próxima vez.
 * Un movimiento es de prueba si cumple AL MENOS UNO de estos criterios:
 *   1. es de un cilindro del kit (serie PRUEBA-01 a PRUEBA-06);
 *   2. lo registró una cuenta de prueba (correo @fpc.test);
 *   3. se hizo a una sucursal del CLIENTE DE PRUEBA (RUT 11111111-1);
 *   4. se hizo con el camión PRUEBA.
 * Si un técnico de prueba escaneó por error un cilindro REAL, ese movimiento también se borra y el
 * trigger devuelve el cilindro a su saldo inicial o a su último movimiento real
 * (migración 20261105120000_saldos_iniciales).
 *
 * No borra el kit (cilindros, cliente, sucursales, camión): quedan en planta, listos para usar.
 * Un comprobante solo se borra si TODOS los movimientos de su folio son de prueba.
 *
 * USO (desde la raíz del repo, con el proyecto enlazado):
 *   node supabase/pruebas/limpiar_kit_prueba.mjs                 vista previa, no escribe nada
 *   node supabase/pruebas/limpiar_kit_prueba.mjs --aplicar       vista previa + confirmación + borrado
 *   ... --aplicar --si                                           sin preguntar (lo usa la prueba del ciclo)
 *   ... --registro <carpeta>                                     guarda ahí el SQL ejecutado
 *
 * El borrado corre en una transacción con guardas: si la cantidad cambió desde la vista previa, o
 * si después del borrado algún cilindro no quedó en el estado anunciado, se deshace entero.
 * Cada movimiento borrado deja su fila DELETE en movimientos_auditoria (inmutable por diseño).
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const SERIE_KIT = 'PRUEBA-0_'; // LIKE: PRUEBA-01 .. PRUEBA-09
const DOMINIO_PRUEBA = '%@fpc.test';
const RUT_CLIENTE_PRUEBA = '11111111-1';
const PATENTE_PRUEBA = 'PRUEBA';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, '..', '..');

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const SIN_PREGUNTAR = args.includes('--si');
const iReg = args.indexOf('--registro');
const REGISTRO = iReg >= 0 ? args[iReg + 1] : null;

// ------------------------------------------------------------------ SQL
const OBJETIVO = `
  select m.uuid_local, m.cilindro_id, m.folio_operacion,
         (k.numero_serie like '${SERIE_KIT}')              as c_kit,
         coalesce(a.email like '${DOMINIO_PRUEBA}', false) as c_usuario,
         coalesce(cl.rut = '${RUT_CLIENTE_PRUEBA}', false) as c_cliente,
         (ca.patente = '${PATENTE_PRUEBA}')                as c_camion
    from public.movimientos m
    join public.cilindros k   on k.id = m.cilindro_id
    join public.camiones ca   on ca.id = m.camion_id
    left join auth.users a    on a.id = m.usuario_id
    left join public.sucursales s on s.id = m.sucursal_id
    left join public.clientes cl  on cl.id = s.cliente_id
   where k.numero_serie like '${SERIE_KIT}'
      or a.email like '${DOMINIO_PRUEBA}'
      or cl.rut = '${RUT_CLIENTE_PRUEBA}'
      or ca.patente = '${PATENTE_PRUEBA}'`;

// Estado que tendrá cada cilindro REAL afectado después del borrado: el último movimiento que
// queda posterior a su saldo; si no hay, el saldo; si no hay saldo, en planta.
const ESPERADO = (obj) => `
  select k.id as cilindro_id, k.numero_serie, k.estado as estado_hoy,
         coalesce(case when r.tipo is null then null when r.tipo = 'entrega' then 'en_cliente' else 'en_camion' end,
                  case when si.cilindro_id is not null then 'en_cliente' else 'en_planta' end) as estado_despues,
         case when r.tipo is not null then (case when r.tipo = 'entrega' then r.sucursal_id end)
              else si.sucursal_id end as sucursal_despues,
         case when r.tipo is not null then 'último movimiento real'
              when si.cilindro_id is not null then 'saldo inicial' else 'sin historial' end as fuente
    from public.cilindros k
    left join public.saldos_iniciales si on si.cilindro_id = k.id
    left join lateral (
      select m.tipo, m.sucursal_id from public.movimientos m
       where m.cilindro_id = k.id
         and m.uuid_local not in (select uuid_local from ${obj})
         and (si.desde is null or m.fecha_evento > si.desde)
       order by m.fecha_evento desc, m.uuid_local desc limit 1) r on true
   where k.id in (select cilindro_id from ${obj}) and k.numero_serie not like '${SERIE_KIT}'`;

const COMPROBANTES = (obj) => `
  select c.folio_operacion from public.comprobantes c
   where c.folio_operacion in (select folio_operacion from ${obj} where folio_operacion is not null)
     and not exists (select 1 from public.movimientos m
                      where m.folio_operacion = c.folio_operacion
                        and m.uuid_local not in (select uuid_local from ${obj}))`;

const VISTA_PREVIA = `
with obj as (${OBJETIVO})
select json_build_object(
  'movimientos', (select count(*) from obj),
  'por_criterio', json_build_object(
     'cilindros_del_kit',      (select count(*) from obj where c_kit),
     'cuentas_de_prueba',      (select count(*) from obj where c_usuario),
     'cliente_de_prueba',      (select count(*) from obj where c_cliente),
     'camion_prueba',          (select count(*) from obj where c_camion)),
  'folios', (select coalesce(json_agg(distinct folio_operacion), '[]') from obj where folio_operacion is not null),
  'comprobantes', (select coalesce(json_agg(folio_operacion), '[]') from (${COMPROBANTES('obj')}) x),
  'comprobantes_mixtos', (select coalesce(json_agg(c.folio_operacion), '[]') from public.comprobantes c
       where c.folio_operacion in (select folio_operacion from obj)
         and c.folio_operacion not in (${COMPROBANTES('obj')})),
  'cilindros_kit', (select count(distinct cilindro_id) from obj where c_kit),
  'cilindros_reales', (select coalesce(json_agg(json_build_object(
       'serie', e.numero_serie, 'hoy', e.estado_hoy, 'despues', e.estado_despues, 'fuente', e.fuente)), '[]')
       from (${ESPERADO('obj')}) e)
) as v`;

function sqlBorrado(esperados) {
  return `-- Limpieza del kit de prueba · ${new Date().toISOString()}
begin;
create temporary table _obj on commit drop as ${OBJETIVO};
create temporary table _esperado on commit drop as ${ESPERADO('_obj')};
create temporary table _comp on commit drop as ${COMPROBANTES('_obj')};

do $$ begin
  if (select count(*) from _obj) <> ${esperados.movimientos}
     or (select count(*) from _comp) <> ${esperados.comprobantes}
     or (select count(*) from _esperado) <> ${esperados.reales} then
    raise exception 'Cambió lo que hay que borrar desde la vista previa: se cancela';
  end if;
end $$;

delete from public.comprobantes where folio_operacion in (select folio_operacion from _comp);
delete from public.movimientos where uuid_local in (select uuid_local from _obj);

do $$ begin
  if exists (${OBJETIVO}) then
    raise exception 'Quedan movimientos de prueba';
  end if;
  if exists (select 1 from public.cilindros where numero_serie like '${SERIE_KIT}'
              and (estado <> 'en_planta' or sucursal_actual_id is not null)) then
    raise exception 'Algún cilindro del kit no quedó en planta';
  end if;
  if exists (select 1 from _esperado e join public.cilindros k on k.id = e.cilindro_id
              where k.estado::text <> e.estado_despues
                 or k.sucursal_actual_id is distinct from e.sucursal_despues) then
    raise exception 'Algún cilindro real no quedó en el estado anunciado';
  end if;
end $$;

commit;
`;
}

// ------------------------------------------------------------------ CLI de Supabase
function consultar(sql) {
  const plano = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
  const salida = execSync(`npx supabase db query --remote --read-only "${plano}"`, {
    cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const filas = JSON.parse(salida.slice(salida.indexOf('{'))).rows;
  const v = filas[0].v;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function ejecutarArchivo(ruta) {
  execSync(`npx supabase db query --remote --yes -f "${ruta}"`, {
    cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ------------------------------------------------------------------ principal
export async function limpiar({ aplicar = APLICAR, sinPreguntar = SIN_PREGUNTAR, registro = REGISTRO, silencioso = false } = {}) {
  const log = silencioso ? () => {} : console.log;
  const vp = consultar(VISTA_PREVIA);
  log('== Vista previa de la limpieza del kit de prueba ==');
  log(`Movimientos de prueba a borrar: ${vp.movimientos}`);
  for (const [k, n] of Object.entries(vp.por_criterio)) log(`  - ${k}: ${n}`);
  log(`Folios: ${vp.folios.join(', ') || '(ninguno)'}`);
  log(`Comprobantes a borrar: ${vp.comprobantes.length} ${vp.comprobantes.length ? `(folios ${vp.comprobantes.join(', ')})` : ''}`);
  if (vp.comprobantes_mixtos.length)
    log(`  OJO: comprobantes que NO se borran porque su folio tiene movimientos reales: ${vp.comprobantes_mixtos.join(', ')}`);
  log(`Cilindros del kit con movimientos: ${vp.cilindros_kit} (quedarán en planta)`);
  log(`Cilindros REALES afectados: ${vp.cilindros_reales.length}`);
  for (const c of vp.cilindros_reales) log(`  - ${c.serie}: ${c.hoy} -> ${c.despues} (${c.fuente})`);

  if (!aplicar) {
    log('\nNo se escribió nada. Para borrar: --aplicar');
    return { vistaPrevia: vp, aplicado: false };
  }
  if (vp.movimientos === 0 && vp.comprobantes.length === 0) {
    log('\nNada que borrar.');
    return { vistaPrevia: vp, aplicado: false };
  }
  if (!sinPreguntar) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const r = (await rl.question('\n¿Borrar lo listado en producción? Escriba "si" para confirmar: ')).trim().toLowerCase();
    rl.close();
    if (r !== 'si') {
      log('Cancelado. No se escribió nada.');
      return { vistaPrevia: vp, aplicado: false };
    }
  }
  const sql = sqlBorrado({
    movimientos: vp.movimientos, comprobantes: vp.comprobantes.length, reales: vp.cilindros_reales.length,
  });
  const carpeta = registro ?? tmpdir();
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, `limpieza_kit_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  writeFileSync(ruta, sql, 'utf8');
  ejecutarArchivo(ruta);
  log(`\nLimpieza aplicada. SQL ejecutado: ${ruta}`);
  return { vistaPrevia: vp, aplicado: true, ruta };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  limpiar().catch((e) => {
    console.error('La limpieza falló y no se aplicó nada:', e.stderr?.toString() || e.message);
    process.exit(1);
  });
}
