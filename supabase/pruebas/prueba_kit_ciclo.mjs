/**
 * Prueba del ciclo completo del kit de prueba (Parte C · 05-11-2026).
 *
 * Como el técnico de prueba A (correo @fpc.test), contra el proyecto enlazado:
 *   1. Carga 3 cilindros del kit al camión PRUEBA      -> quedan en_camion.
 *   2. Los entrega a la sucursal «PRUEBA 2» con folio   -> en_cliente, un solo folio, comprobante.
 *   3. Retira un cilindro REAL que tiene saldo inicial  -> en_camion (el «error» del técnico).
 *   4. Vista previa de la limpieza: anuncia 7 movimientos, 1 comprobante y 1 cilindro real que
 *      vuelve a su saldo.
 *   5. Limpieza con --aplicar.
 *   6. Los 3 del kit en planta, el real de vuelta en su saldo (cliente y fecha), cero movimientos
 *      de prueba, y los hashes de cilindros (sin el kit), movimientos y comprobantes iguales a
 *      los de antes.
 * Si algo falla a mitad de camino, el `finally` corre la limpieza igual.
 *
 * ⚠️ Consume 1 número de folio_operacion_seq (no se reinicia) y deja filas DELETE en
 * movimientos_auditoria (inmutable por diseño). La prueba informa ambos.
 *
 * USO: `supabase/pruebas/.env` con SUPABASE_URL, SUPABASE_ANON_KEY, TEC_A_EMAIL, TEC_A_PASSWORD;
 * `@supabase/supabase-js` resoluble desde esta carpeta; `node supabase/pruebas/prueba_kit_ciclo.mjs`.
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { limpiar } from './limpiar_kit_prueba.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, '..', '..');
const RUTA_ENV_RESPALDO = 'C:/Users/Nicolas/Desktop/Proyectos/FPC-Mobile/supabase/pruebas/.env';
const MARCA = 'PRUEBA-KIT';

for (const candidata of [path.join(AQUI, '.env'), RUTA_ENV_RESPALDO]) {
  if (existsSync(candidata)) {
    for (const linea of readFileSync(candidata, 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) process.env[m[1]] ??= m[2];
    }
    break;
  }
}
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEC_A_EMAIL, TEC_A_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEC_A_EMAIL || !TEC_A_PASSWORD) {
  console.error('Faltan variables en .env (ver .env.example).');
  process.exit(1);
}

function db(sql) {
  const plano = sql.replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
  const salida = execSync(`npx supabase db query --remote --read-only "${plano}"`, {
    cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(salida.slice(salida.indexOf('{'))).rows;
}

const FOTO = `select
  (select md5(coalesce(string_agg(id::text || estado || coalesce(sucursal_actual_id::text, '')
          || coalesce(en_cliente_desde::text, '') || coalesce(codigo_barras, ''), '|' order by id), ''))
     from public.cilindros where numero_serie not like 'PRUEBA-0_') as h_cil,
  (select md5(coalesce(string_agg(m::text, '|' order by uuid_local), '')) from public.movimientos m) as h_mov,
  (select md5(coalesce(string_agg(c::text, '|' order by folio_operacion), '')) from public.comprobantes c) as h_comp,
  (select count(*) from public.movimientos) as movs,
  (select count(*) from public.movimientos_auditoria) as auditoria,
  (select last_value from public.folio_operacion_seq) as folio_seq`;

const resultados = [];
const anotar = (caso, ok, detalle) => resultados.push({ caso, resultado: ok ? 'PASA' : 'FALLA', detalle });

const estado = (serie) => db(`select k.estado, k.sucursal_actual_id, k.en_cliente_desde
  from public.cilindros k where k.numero_serie = '${serie}'`)[0];

async function main() {
  const antes = db(FOTO)[0];
  const real = db(`select k.numero_serie, si.sucursal_id, si.desde from public.saldos_iniciales si
      join public.cilindros k on k.id = si.cilindro_id
     where not exists (select 1 from public.movimientos m where m.cilindro_id = k.id)
     order by k.numero_serie limit 1`)[0];

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: sesion, error: eLogin } = await sb.auth.signInWithPassword({ email: TEC_A_EMAIL, password: TEC_A_PASSWORD });
  if (eLogin) throw new Error(`login: ${eLogin.message}`);
  const uid = sesion.user.id;

  const { data: kit, error: eKit } = await sb.from('cilindros').select('id, numero_serie')
    .in('numero_serie', ['PRUEBA-01', 'PRUEBA-02', 'PRUEBA-03']).order('numero_serie');
  const { data: suc } = await sb.from('sucursales').select('id, clientes!inner(rut)')
    .eq('nombre', 'PRUEBA 2').eq('clientes.rut', '11111111-1').single();
  const { data: cam } = await sb.from('camiones').select('id').eq('patente', 'PRUEBA').single();
  const { data: cilReal } = await sb.from('cilindros').select('id').eq('numero_serie', real.numero_serie).single();
  if (eKit || kit?.length !== 3 || !suc || !cam || !cilReal) throw new Error('No se encontró el kit como se esperaba');

  const base = Date.now();
  const mov = (tipo, cilindro_id, sucursal_id, dt) => ({
    uuid_local: randomUUID(), tipo, cilindro_id, sucursal_id, usuario_id: uid, camion_id: cam.id,
    fecha_evento: new Date(base + dt).toISOString(), codigo_origen: 'escaner', documento_referencia: MARCA,
  });

  try {
    // 1. carga
    const cargas = kit.map((c) => mov('carga', c.id, null, 0));
    let r = await sb.from('movimientos').insert(cargas);
    if (r.error) throw new Error(`carga: ${r.error.message}`);
    const e1 = kit.map((c) => estado(c.numero_serie).estado);
    anotar('1 · Carga de 3 cilindros del kit', e1.every((e) => e === 'en_camion'), e1.join(', '));

    // 2. entrega con folio y comprobante
    const entregas = kit.map((c) => mov('entrega', c.id, suc.id, 1000));
    r = await sb.from('movimientos').insert(entregas);
    if (r.error) throw new Error(`entrega: ${r.error.message}`);
    const { data: folio, error: eFolio } = await sb.rpc('asignar_folio_despacho', { p_uuids: entregas.map((m) => m.uuid_local) });
    if (eFolio) throw new Error(`folio: ${eFolio.message}`);
    const { data: est, error: eComp } = await sb.rpc('registrar_comprobante', {
      p_folio: folio, p_email: null, p_guardar_en_sucursal: false, p_motivo_sin_correo: 'prueba del kit',
    });
    if (eComp) throw new Error(`comprobante: ${eComp.message}`);
    const e2 = kit.map((c) => estado(c.numero_serie));
    anotar('2 · Entrega a PRUEBA 2 con folio', e2.every((e) => e.estado === 'en_cliente' && e.sucursal_actual_id === suc.id)
      && est === 'sin_correo', `folio ${folio}, comprobante ${est}`);

    // 3. retiro de un cilindro real con saldo
    r = await sb.from('movimientos').insert([mov('retiro', cilReal.id, real.sucursal_id, 2000)]);
    if (r.error) throw new Error(`retiro real: ${r.error.message}`);
    const e3 = estado(real.numero_serie);
    anotar('3 · Retiro de un cilindro real con saldo', e3.estado === 'en_camion', e3.estado);

    // 4. vista previa
    const vp = await limpiar({ aplicar: false, silencioso: true });
    anotar('4 · Vista previa de la limpieza',
      vp.vistaPrevia.movimientos === 7 && vp.vistaPrevia.comprobantes.length === 1
        && vp.vistaPrevia.cilindros_reales.length === 1
        && vp.vistaPrevia.cilindros_reales[0].despues === 'en_cliente'
        && vp.vistaPrevia.cilindros_reales[0].fuente === 'saldo inicial',
      `${vp.vistaPrevia.movimientos} movimientos, ${vp.vistaPrevia.comprobantes.length} comprobante, `
        + `${vp.vistaPrevia.cilindros_reales.length} cilindro real -> ${vp.vistaPrevia.cilindros_reales[0]?.despues}`);
  } finally {
    // 5. limpieza (siempre)
    const lp = await limpiar({ aplicar: true, sinPreguntar: true, silencioso: true, registro: process.env.REGISTRO_LIMPIEZA });
    anotar('5 · Limpieza --aplicar', lp.aplicado, lp.ruta ?? 'nada que borrar');
  }

  // 6. verificación
  const kitDespues = ['PRUEBA-01', 'PRUEBA-02', 'PRUEBA-03'].map(estado);
  anotar('6a · Kit de vuelta en planta', kitDespues.every((e) => e.estado === 'en_planta' && !e.sucursal_actual_id),
    kitDespues.map((e) => e.estado).join(', '));
  const e6 = estado(real.numero_serie);
  anotar('6b · Cilindro real de vuelta en su saldo',
    e6.estado === 'en_cliente' && e6.sucursal_actual_id === real.sucursal_id
      && new Date(e6.en_cliente_desde).getTime() === new Date(real.desde).getTime(),
    `${e6.estado} desde ${e6.en_cliente_desde}`);
  const marcas = db(`select count(*) n from public.movimientos where documento_referencia = '${MARCA}'`)[0].n;
  anotar('6c · Sin movimientos de prueba', Number(marcas) === 0, `${marcas} con la marca ${MARCA}`);
  const despues = db(FOTO)[0];
  anotar('6d · Nada más cambió (hash cilindros sin kit, movimientos, comprobantes)',
    antes.h_cil === despues.h_cil && antes.h_mov === despues.h_mov && antes.h_comp === despues.h_comp,
    `movimientos ${antes.movs} -> ${despues.movs}`);

  console.log('\n== Resultados ==\n');
  for (const r of resultados) console.log(`${r.caso}: ${r.resultado}\n  ${r.detalle}`);
  console.log(`\nfolio_operacion_seq: ${antes.folio_seq} -> ${despues.folio_seq}`
    + ` · movimientos_auditoria: ${antes.auditoria} -> ${despues.auditoria}`);
  if (resultados.some((r) => r.resultado === 'FALLA')) process.exit(1);
}

main().catch((e) => {
  console.error('La prueba falló:', e.stderr?.toString() || e.message);
  for (const r of resultados) console.log(`${r.caso}: ${r.resultado} · ${r.detalle}`);
  process.exit(1);
});
