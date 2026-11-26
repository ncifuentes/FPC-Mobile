/**
 * Prueba de extremo a extremo del envío de movimientos desde la app
 * (tarea "movimientos, historial y sincronización con Supabase").
 *
 * ESTRUCTURA: mismo patrón que `prueba_catalogo_app.mjs` (carga de `.env`,
 * `dbQuery` vía `supabase db query --linked`, tabla PASA/FALLA). Autenticado
 * como el técnico de prueba A, con la clave publicable: corre con los mismos
 * permisos que el teléfono.
 *
 * Casos 1–8: lo que exige la tarea sobre `public.movimientos` (upsert
 * idempotente, `fecha_sync` del servidor, trigger de estado, constraint, RLS,
 * folio). Caso 9: integración del ciclo real de la app (`procesarCola.ts` con la
 * cola en memoria) contra este mismo servidor, que es lo más cerca del
 * sincronizador que se puede llegar sin teléfono.
 *
 * DATOS DE PRUEBA. Usa 3 cilindros `en_planta` SIN ningún movimiento: al borrar
 * los de prueba, el trigger recalcula desde el historial que queda (vacío) y los
 * deja `en_planta`, que es exactamente su estado original. Todo movimiento de
 * prueba lleva `documento_referencia = 'PRUEBA-SYNC'`. El técnico no puede
 * borrar (no hay política de DELETE), así que la limpieza va por
 * `supabase db query --linked --yes` en un `finally`, y después se verifica con
 * `select` que no quedan filas con la marca y que cada cilindro volvió a su
 * estado anotado al inicio.
 *
 * ⚠️ La tabla `movimientos_auditoria` registra cada UPDATE (folio) y DELETE
 * (limpieza) de estos movimientos. Es un registro inmutable por diseño: esta
 * prueba NO lo borra; informa cuántas filas quedaron.
 *
 * CÓMO SE USA
 *   1. `supabase/pruebas/.env` con SUPABASE_URL, SUPABASE_ANON_KEY,
 *      TEC_A_EMAIL/TEC_A_PASSWORD (ver `.env.example`).
 *   2. `npx supabase link --project-ref <ref>` hecho.
 *   3. `node supabase/pruebas/prueba_sync_movimientos.mjs` (usa el
 *      `@supabase/supabase-js` de `App/node_modules` si no hay otro).
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA_ENV_RESPALDO = 'C:/Users/Nicolas/Desktop/Proyectos/FPC-Mobile/supabase/pruebas/.env';

function cargarEnv(ruta) {
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2];
  }
}

let rutaEnvUsada = null;
for (const candidata of [path.join(AQUI, '.env'), RUTA_ENV_RESPALDO]) {
  if (existsSync(candidata)) {
    cargarEnv(candidata);
    rutaEnvUsada = candidata;
    break;
  }
}
if (!rutaEnvUsada) {
  console.error('No se encontró .env. Copiar .env.example a .env en esta carpeta y completarlo.');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_ANON_KEY, TEC_A_EMAIL, TEC_A_PASSWORD } = process.env;
for (const [clave, valor] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, TEC_A_EMAIL, TEC_A_PASSWORD })) {
  if (!valor) {
    console.error(`Falta ${clave} en ${rutaEnvUsada}. Ver .env.example.`);
    process.exit(1);
  }
}

function resolverRaizRepo() {
  const candidata = path.resolve(AQUI, '..', '..');
  if (existsSync(path.join(candidata, 'supabase', 'config.toml'))) return candidata;
  return 'C:/Users/Nicolas/Desktop/Proyectos/FPC-Mobile-capstone';
}
const RAIZ_REPO = resolverRaizRepo();

// supabase-js: el de una carpeta con node_modules en la ruta, o el de la app.
let createClient;
try {
  ({ createClient } = await import('@supabase/supabase-js'));
} catch {
  ({ createClient } = createRequire(path.join(RAIZ_REPO, 'App', 'package.json'))('@supabase/supabase-js'));
}

// Lógica real de la app (ver prueba_sync_local.mjs por el hook de extensiones).
registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith('.') && contexto.parentURL?.endsWith('.ts')) {
      const base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador);
      if (!existsSync(base) && existsSync(`${base}.ts`)) {
        return siguiente(pathToFileURL(`${base}.ts`).href, contexto);
      }
    }
    return siguiente(especificador, contexto);
  },
});
const APP = path.join(RAIZ_REPO, 'App', 'src');
const { crearColaMemoria } = await import(pathToFileURL(path.join(APP, 'sync/colaMemoria.ts')).href);
const { procesarCola, columnasMovimiento } = await import(
  pathToFileURL(path.join(APP, 'sync/procesarCola.ts')).href
);

/** Solo lectura salvo que se pida lo contrario: el CLI exige `--yes` para escribir. */
function dbQuery(sql, { escritura = false } = {}) {
  const modo = escritura ? '--yes' : '--read-only';
  // cmd.exe corta el comando en el salto de línea: el SQL va en una sola.
  const enUnaLinea = sql.replace(/\s+/g, ' ').trim();
  const comando = `npx supabase db query --linked ${modo} "${enUnaLinea.replace(/"/g, '\\"')}"`;
  const salida = execSync(comando, { cwd: RAIZ_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(salida.slice(salida.indexOf('{')));
}

const MARCA = 'PRUEBA-SYNC';
const minutos = (base, n) => new Date(base.getTime() + n * 60_000).toISOString();

/* ------------------------------------------------------------------- contexto */

const tecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let uid;
let camionId;
let sucursalId;
let tecnicoB;
let cil = []; // [{ id, numero_serie, estado, sucursal_actual_id }]
const T0 = new Date();

function fila(tipo, cilindro, minuto, extra = {}) {
  return {
    uuid_local: randomUUID(),
    tipo,
    cilindro_id: cilindro.id,
    sucursal_id: tipo === 'carga' ? null : sucursalId,
    usuario_id: uid,
    camion_id: camionId,
    fecha_evento: minutos(T0, minuto),
    codigo_origen: 'manual',
    documento_referencia: MARCA,
    ...extra,
  };
}

const upsert = (filas) =>
  tecnico.from('movimientos').upsert(filas, { onConflict: 'uuid_local', ignoreDuplicates: true });

async function estadoCilindro(id) {
  const { data } = await tecnico
    .from('cilindros')
    .select('estado,sucursal_actual_id')
    .eq('id', id)
    .single();
  return data;
}

async function preparar() {
  const { data, error } = await tecnico.auth.signInWithPassword({ email: TEC_A_EMAIL, password: TEC_A_PASSWORD });
  if (error || !data.user) throw new Error(`no se pudo autenticar: ${error?.message}`);
  uid = data.user.id;

  const { data: yo } = await tecnico.from('usuarios').select('camion_jornada_id').eq('id', uid).single();
  camionId = yo?.camion_jornada_id;
  if (!camionId) {
    const { data: cam } = await tecnico.from('camiones').select('id').eq('activo', true).limit(1).single();
    camionId = cam.id;
  }
  const { data: suc } = await tecnico.from('sucursales').select('id').eq('activo', true).order('id').limit(1).single();
  sucursalId = suc.id;

  tecnicoB = dbQuery(
    `select id from public.usuarios where rol = 'tecnico' and id <> '${uid}' order by id limit 1;`,
  ).rows?.[0]?.id;

  cil = dbQuery(
    `select c.id, c.numero_serie, c.estado, c.sucursal_actual_id from public.cilindros c
      where c.estado = 'en_planta'
        and not exists (select 1 from public.movimientos m where m.cilindro_id = c.id)
      order by c.numero_serie limit 3;`,
  ).rows;
  if (cil.length < 3) throw new Error('no hay 3 cilindros en_planta sin movimientos para la prueba');
}

/* ------------------------------------------------------------------------ casos */

const lote1 = [];

async function caso1() {
  lote1.push(fila('carga', cil[0], 0), fila('carga', cil[1], 0));
  const { error } = await upsert(lote1);
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const { count } = await tecnico
    .from('movimientos')
    .select('uuid_local', { count: 'exact', head: true })
    .in('uuid_local', lote1.map((f) => f.uuid_local));
  return count === 2
    ? { resultado: 'PASA', detalle: '2 filas creadas con upsert ignoreDuplicates' }
    : { resultado: 'FALLA', detalle: `filas=${count}` };
}

async function caso2() {
  const { error } = await upsert(lote1);
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const { count } = await tecnico
    .from('movimientos')
    .select('uuid_local', { count: 'exact', head: true })
    .in('uuid_local', lote1.map((f) => f.uuid_local));
  return count === 2
    ? { resultado: 'PASA', detalle: 'reenvío sin error y siguen 2 filas' }
    : { resultado: 'FALLA', detalle: `filas=${count}` };
}

async function caso3() {
  const f = fila('carga', cil[2], 0, { fecha_sync: '2000-01-01T00:00:00Z' });
  const { error } = await upsert([f]);
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const { data } = await tecnico.from('movimientos').select('fecha_sync').eq('uuid_local', f.uuid_local).single();
  const diferencia = Math.abs(Date.now() - new Date(data.fecha_sync).getTime());
  return diferencia < 10 * 60_000
    ? { resultado: 'PASA', detalle: `cliente mandó 2000-01-01, servidor selló ${data.fecha_sync}` }
    : { resultado: 'FALLA', detalle: `fecha_sync=${data.fecha_sync}` };
}

let entrega1;
async function caso4() {
  entrega1 = fila('entrega', cil[0], 5);
  const { error } = await upsert([entrega1]);
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const e = await estadoCilindro(cil[0].id);
  return e.estado === 'en_cliente' && e.sucursal_actual_id === sucursalId
    ? { resultado: 'PASA', detalle: `${cil[0].numero_serie}: carga → entrega = en_cliente en la sucursal correcta` }
    : { resultado: 'FALLA', detalle: JSON.stringify(e) };
}

async function caso5() {
  const { error } = await upsert([fila('entrega', cil[1], 6, { sucursal_id: null })]);
  return error?.code === '23514'
    ? { resultado: 'PASA', detalle: `rechazada: ${error.message}` }
    : { resultado: 'FALLA', detalle: error ? `${error.code} ${error.message}` : 'se aceptó' };
}

async function caso6() {
  if (!tecnicoB) return { resultado: 'FALLA', detalle: 'no hay un segundo técnico para probar' };
  const { error } = await upsert([fila('carga', cil[1], 7, { usuario_id: tecnicoB })]);
  return error?.code === '42501'
    ? { resultado: 'PASA', detalle: `rechazado por RLS (${error.code})` }
    : { resultado: 'FALLA', detalle: error ? `${error.code} ${error.message}` : 'se aceptó' };
}

async function caso7() {
  const entrega2 = fila('entrega', cil[1], 8);
  const { error } = await upsert([entrega2]);
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const uuids = [entrega1.uuid_local, entrega2.uuid_local];
  const a = await tecnico.rpc('asignar_folio_despacho', { p_uuids: uuids });
  const b = await tecnico.rpc('asignar_folio_despacho', { p_uuids: uuids });
  if (a.error || b.error) return { resultado: 'FALLA', detalle: (a.error ?? b.error).message };
  const { data } = await tecnico.from('movimientos').select('folio_operacion').in('uuid_local', uuids);
  const ok = a.data === b.data && data.length === 2 && data.every((r) => Number(r.folio_operacion) === Number(a.data));
  return ok
    ? { resultado: 'PASA', detalle: `folio ${a.data} para el grupo; el reintento devolvió el mismo` }
    : { resultado: 'FALLA', detalle: `1ª=${a.data} 2ª=${b.data} filas=${JSON.stringify(data)}` };
}

async function caso8() {
  const objetivo = lote1[0].uuid_local;
  const upd = await tecnico
    .from('movimientos')
    .update({ documento_referencia: 'HACKEADO' })
    .eq('uuid_local', objetivo)
    .select('uuid_local');
  const del = await tecnico.from('movimientos').delete().eq('uuid_local', objetivo).select('uuid_local');
  const { data } = await tecnico
    .from('movimientos')
    .select('documento_referencia')
    .eq('uuid_local', objetivo)
    .maybeSingle();
  const updBloqueado = upd.error !== null || upd.data.length === 0;
  const delBloqueado = del.error !== null || del.data.length === 0;
  const intacta = data?.documento_referencia === MARCA;
  return updBloqueado && delBloqueado && intacta
    ? {
        resultado: 'PASA',
        detalle: `UPDATE: ${upd.error ? upd.error.code : '0 filas'} · DELETE: ${del.error ? del.error.code : '0 filas'} · fila intacta`,
      }
    : { resultado: 'FALLA', detalle: `upd=${JSON.stringify(upd)} del=${JSON.stringify(del)} fila=${JSON.stringify(data)}` };
}

/** Ciclo real de la app contra el servidor real, con la marca de prueba agregada. */
async function caso9() {
  let insertsLlamados = 0;
  const servidor = {
    async insertar(lote) {
      insertsLlamados += 1;
      const { error, status } = await upsert(
        lote.map((m) => ({ ...columnasMovimiento(m), documento_referencia: MARCA })),
      );
      return error ? { message: error.message, code: error.code, status } : null;
    },
    async asignarFolio(uuids) {
      const { error, status } = await tecnico.rpc('asignar_folio_despacho', { p_uuids: uuids });
      return error ? { message: error.message, code: error.code, status } : null;
    },
  };
  const base = (tipo, cilindro, minuto, extra) => ({
    uuidLocal: randomUUID(),
    tipo,
    cilindroId: cilindro.id,
    sucursalId: tipo === 'carga' ? null : sucursalId,
    usuarioId: uid,
    camionId,
    fechaEvento: minutos(T0, minuto),
    fechaSync: null,
    origenCodigo: 'escaner',
    despachoId: tipo === 'carga' ? null : 'despacho-prueba',
    codigoCilindro: cilindro.numero_serie,
    nombreCliente: null,
    nombreSucursal: null,
    ...extra,
  });
  const cola = crearColaMemoria();
  const retiro = base('retiro', cil[0], 20);
  const entrega = base('entrega', cil[2], 21);
  const malo = base('entrega', cil[1], 22, { sucursalId: null, despachoId: 'otro-despacho' });
  for (const m of [retiro, malo, entrega]) await cola.encolar(m);

  const r = await procesarCola(cola, servidor, uid);
  const quedan = await cola.listar();
  const { data: filas } = await tecnico
    .from('movimientos')
    .select('uuid_local,folio_operacion')
    .in('uuid_local', [retiro.uuidLocal, entrega.uuidLocal, malo.uuidLocal]);
  const folios = new Set(filas.map((f) => f.folio_operacion));
  const e0 = await estadoCilindro(cil[0].id);
  const e2 = await estadoCilindro(cil[2].id);

  const antes = insertsLlamados;
  await procesarCola(cola, servidor, uid);
  const sinReenvio = insertsLlamados === antes;

  const ok =
    r.insertados.length === 2 &&
    r.rechazados === 1 &&
    r.folios === 1 &&
    filas.length === 2 &&
    folios.size === 1 &&
    !folios.has(null) &&
    quedan.length === 1 &&
    quedan[0].uuidLocal === malo.uuidLocal &&
    quedan[0].estadoEnvio === 'rechazado' &&
    e0.estado === 'en_camion' &&
    e2.estado === 'en_cliente' &&
    sinReenvio;
  return ok
    ? {
        resultado: 'PASA',
        detalle: `2 insertados con folio ${[...folios][0]}, 1 rechazado aislado y retenido en la cola; segundo ciclo sin reenvíos`,
      }
    : {
        resultado: 'FALLA',
        detalle: `r=${JSON.stringify({ ...r, insertados: r.insertados.length })} filas=${JSON.stringify(filas)} quedan=${quedan.map((m) => m.estadoEnvio)} e0=${e0.estado} e2=${e2.estado} sinReenvio=${sinReenvio}`,
      };
}

/* -------------------------------------------------------------------- limpieza */

function limpiarYVerificar() {
  dbQuery(`delete from public.movimientos where documento_referencia = '${MARCA}';`, { escritura: true });
  const quedan = dbQuery(
    `select count(*)::int as n from public.movimientos where documento_referencia = '${MARCA}';`,
  ).rows[0].n;
  const ids = cil.map((c) => `'${c.id}'`).join(',');
  const estados = ids
    ? dbQuery(`select id, estado, sucursal_actual_id from public.cilindros where id in (${ids});`).rows
    : [];
  const restaurados = cil.every((c) => {
    const actual = estados.find((e) => e.id === c.id);
    return actual && actual.estado === c.estado && actual.sucursal_actual_id === c.sucursal_actual_id;
  });
  const auditoria = dbQuery(
    `select count(*)::int as n from public.movimientos_auditoria where datos_antes->>'documento_referencia' = '${MARCA}';`,
  ).rows[0].n;
  return { quedan, restaurados, estados, auditoria };
}

/* ------------------------------------------------------------------------- main */

const DESCRIPCIONES = {
  1: 'Insert de un lote con upsert ignoreDuplicates crea las filas',
  2: 'Reenviar el mismo lote no duplica',
  3: 'fecha_sync la sella el servidor aunque el cliente mande otra',
  4: 'Carga y luego entrega dejan en_cliente con la sucursal correcta',
  5: 'Entrega sin sucursal_id rechazada por constraint',
  6: 'Técnico no puede insertar con el usuario_id de otro',
  7: 'asignar_folio_despacho asigna un folio al grupo y es idempotente',
  8: 'Técnico no puede UPDATE ni DELETE movimientos',
  9: 'Integración: ciclo real de la app (procesarCola) contra el servidor',
};

async function main() {
  console.log(`(usando .env de: ${rutaEnvUsada})\n`);
  const resultados = {};
  let limpieza;
  try {
    await preparar();
    console.log('Cilindros de prueba (estado original):');
    for (const c of cil) console.log(`  ${c.numero_serie}: ${c.estado} · sucursal=${c.sucursal_actual_id}`);
    const casos = [caso1, caso2, caso3, caso4, caso5, caso6, caso7, caso8, caso9];
    for (let i = 0; i < casos.length; i++) {
      try {
        resultados[i + 1] = await casos[i]();
      } catch (e) {
        resultados[i + 1] = { resultado: 'FALLA', detalle: `excepción: ${e.message}` };
      }
    }
  } finally {
    try {
      limpieza = limpiarYVerificar();
    } catch (e) {
      console.error('⚠️ La limpieza falló:', e.message);
    }
  }

  console.log('\n== Resultados ==\n');
  for (let i = 1; i <= 9; i++) {
    const r = resultados[i] ?? { resultado: 'FALLA', detalle: 'no se ejecutó' };
    console.log(`Caso ${i} · ${DESCRIPCIONES[i]}: ${r.resultado}`);
    console.log(`  ${r.detalle}`);
  }

  console.log('\n== Limpieza ==\n');
  if (!limpieza) {
    console.log(`NO SE PUDO LIMPIAR — borrar a mano los movimientos con documento_referencia = '${MARCA}'`);
  } else {
    console.log(`Movimientos con la marca que quedan: ${limpieza.quedan} ${limpieza.quedan === 0 ? '(PASA)' : '(FALLA)'}`);
    console.log(`Cilindros de vuelta a su estado original: ${limpieza.restaurados ? 'sí (PASA)' : 'NO (FALLA)'}`);
    for (const e of limpieza.estados) console.log(`  ${e.id}: ${e.estado} · sucursal=${e.sucursal_actual_id}`);
    console.log(`Filas de movimientos_auditoria que dejó la prueba (no se borran): ${limpieza.auditoria}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR inesperado:', e);
  process.exit(1);
});
