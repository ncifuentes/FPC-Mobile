/**
 * Prueba contra Supabase del arreglo "un folio por visita": el ciclo real de la
 * app (`procesarCola.ts` con la cola en memoria y sus visitas) contra el
 * proyecto, autenticado como el técnico de prueba A con la clave publicable.
 *
 * EL ERROR QUE CUBRE. Con señal, cada cilindro sube apenas se escanea; antes del
 * arreglo el ciclo pedía el folio en ese momento y cada cilindro de una misma
 * visita quedaba con un folio distinto. Ahora el folio espera a que la visita se
 * cierre.
 *
 * Casos:
 *  1. Visita abierta con 3 entregas escaneadas con señal (un ciclo por
 *     cilindro): las 3 llegan al servidor y ninguna tiene folio todavía.
 *  2. Al cerrar la visita, un ciclo deja las 3 con el MISMO folio.
 *  3. Volver a llamar `asignar_folio_despacho` con los 3 no cambia el folio.
 *  4. Una segunda visita (otra sucursal) recibe un folio distinto y el siguiente
 *     de la secuencia (consecutivo si nadie más pidió folio entremedio).
 *
 * DATOS DE PRUEBA. 6 cilindros `en_planta` SIN movimientos: al borrar los de
 * prueba, el trigger recalcula desde un historial vacío y vuelven a `en_planta`.
 * Todo movimiento lleva `documento_referencia = 'PRUEBA-FOLIO'`. El técnico no
 * puede borrar, así que la limpieza va por `supabase db query --linked --yes` en
 * un `finally`, y después se verifica que no quedan filas con la marca y que
 * cada cilindro volvió a su estado anotado al inicio.
 *
 * ⚠️ Consume 2 números de `folio_operacion_seq` (no se resetea: lo decide el
 * equipo) y deja filas en `movimientos_auditoria` (el UPDATE del folio y el
 * DELETE de la limpieza), que es inmutable por diseño. La prueba informa ambos.
 *
 * CÓMO SE USA
 *   1. `supabase/pruebas/.env` con SUPABASE_URL, SUPABASE_ANON_KEY,
 *      TEC_A_EMAIL/TEC_A_PASSWORD (ver `.env.example`).
 *   2. `npx supabase link --project-ref <ref>` hecho.
 *   3. `node supabase/pruebas/prueba_folio_visita.mjs`.
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

const MARCA = 'PRUEBA-FOLIO';
const T0 = new Date();
const minutos = (n) => new Date(T0.getTime() + n * 60_000).toISOString();

/* ------------------------------------------------------------------- contexto */

const tecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let uid;
let camionId;
let sucursales = []; // dos sucursales activas distintas
let cil = []; // [{ id, numero_serie, estado, sucursal_actual_id }]

const servidor = {
  async insertar(lote) {
    const { error, status } = await tecnico.from('movimientos').upsert(
      lote.map((m) => ({ ...columnasMovimiento(m), documento_referencia: MARCA })),
      { onConflict: 'uuid_local', ignoreDuplicates: true },
    );
    return error ? { message: error.message, code: error.code, status } : null;
  },
  async asignarFolio(uuids) {
    const { error, status } = await tecnico.rpc('asignar_folio_despacho', { p_uuids: uuids });
    return error ? { message: error.message, code: error.code, status } : null;
  },
};

function entrega(cilindro, sucursalId, despachoId, minuto) {
  return {
    uuidLocal: randomUUID(),
    tipo: 'entrega',
    cilindroId: cilindro.id,
    sucursalId,
    usuarioId: uid,
    camionId,
    fechaEvento: minutos(minuto),
    fechaSync: null,
    origenCodigo: 'escaner',
    despachoId,
    codigoCilindro: cilindro.numero_serie,
    nombreCliente: null,
    nombreSucursal: null,
  };
}

async function folios(uuids) {
  const { data, error } = await tecnico
    .from('movimientos')
    .select('uuid_local,folio_operacion')
    .in('uuid_local', uuids);
  if (error) throw new Error(`no se pudo leer los folios: ${error.message}`);
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
  const { data: suc } = await tecnico.from('sucursales').select('id').eq('activo', true).order('id').limit(2);
  sucursales = (suc ?? []).map((s) => s.id);
  if (sucursales.length < 2) throw new Error('no hay 2 sucursales activas para la prueba');

  cil = dbQuery(
    `select c.id, c.numero_serie, c.estado, c.sucursal_actual_id from public.cilindros c
      where c.estado = 'en_planta'
        and not exists (select 1 from public.movimientos m where m.cilindro_id = c.id)
      order by c.numero_serie limit 6;`,
  ).rows;
  if (cil.length < 6) throw new Error('no hay 6 cilindros en_planta sin movimientos para la prueba');
}

/* ------------------------------------------------------------------------ casos */

const cola = crearColaMemoria();
let visitaA = [];
let folioA = null;

async function caso1() {
  await cola.abrirDespacho({ despachoId: 'visita-a', usuarioId: uid, sucursalId: sucursales[0] });
  visitaA = cil.slice(0, 3).map((c, i) => entrega(c, sucursales[0], 'visita-a', i));
  // Como la app con señal: cada escaneo encola y corre un ciclo.
  for (const m of visitaA) {
    await cola.encolar(m);
    await procesarCola(cola, servidor, uid);
  }
  const filas = await folios(visitaA.map((m) => m.uuidLocal));
  const enCola = await cola.listar();
  const ok =
    filas.length === 3 &&
    filas.every((f) => f.folio_operacion === null) &&
    enCola.length === 3 &&
    enCola.every((m) => m.estadoEnvio === 'sin_folio');
  return ok
    ? { resultado: 'PASA', detalle: '3 entregas en el servidor, ninguna con folio mientras la visita sigue abierta' }
    : { resultado: 'FALLA', detalle: `filas=${JSON.stringify(filas)} cola=${enCola.map((m) => m.estadoEnvio)}` };
}

async function caso2() {
  await cola.cerrarDespacho('visita-a');
  const r = await procesarCola(cola, servidor, uid);
  const filas = await folios(visitaA.map((m) => m.uuidLocal));
  const distintos = new Set(filas.map((f) => f.folio_operacion));
  folioA = filas[0]?.folio_operacion ?? null;
  const ok =
    r.folios === 1 &&
    filas.length === 3 &&
    distintos.size === 1 &&
    folioA !== null &&
    (await cola.listar()).length === 0 &&
    (await cola.listarDespachos()).length === 0;
  return ok
    ? { resultado: 'PASA', detalle: `las 3 con folio ${folioA}; cola y visita vacías` }
    : { resultado: 'FALLA', detalle: `r.folios=${r.folios} folios=${[...distintos]}` };
}

async function caso3() {
  const { data, error } = await tecnico.rpc('asignar_folio_despacho', {
    p_uuids: visitaA.map((m) => m.uuidLocal),
  });
  if (error) return { resultado: 'FALLA', detalle: `${error.code} ${error.message}` };
  const filas = await folios(visitaA.map((m) => m.uuidLocal));
  const ok = Number(data) === folioA && filas.every((f) => f.folio_operacion === folioA);
  return ok
    ? { resultado: 'PASA', detalle: `la función devolvió ${data} otra vez y las filas no cambiaron` }
    : { resultado: 'FALLA', detalle: `devolvió=${data} filas=${JSON.stringify(filas)}` };
}

async function caso4() {
  await cola.abrirDespacho({ despachoId: 'visita-b', usuarioId: uid, sucursalId: sucursales[1] });
  const visitaB = cil.slice(3, 6).map((c, i) => entrega(c, sucursales[1], 'visita-b', 10 + i));
  for (const m of visitaB) {
    await cola.encolar(m);
    await procesarCola(cola, servidor, uid);
  }
  await cola.cerrarDespacho('visita-b');
  await procesarCola(cola, servidor, uid);
  const filas = await folios(visitaB.map((m) => m.uuidLocal));
  const distintos = new Set(filas.map((f) => f.folio_operacion));
  const folioB = filas[0]?.folio_operacion ?? null;
  const ok = distintos.size === 1 && folioB !== null && folioB !== folioA && folioB === folioA + 1;
  return ok
    ? { resultado: 'PASA', detalle: `visita A folio ${folioA}, visita B folio ${folioB}` }
    : {
        resultado: 'FALLA',
        detalle: `A=${folioA} B=${[...distintos]} (si B > A+1, alguien pidió un folio entremedio)`,
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
  1: 'Visita abierta: 3 entregas suben con señal y no reciben folio',
  2: 'Al cerrar la visita, las 3 quedan con el mismo folio',
  3: 'Repetir asignar_folio_despacho no cambia el folio',
  4: 'Una segunda visita recibe un folio distinto y consecutivo',
};

async function main() {
  console.log(`(usando .env de: ${rutaEnvUsada})\n`);
  const resultados = {};
  let limpieza;
  try {
    await preparar();
    console.log('Cilindros de prueba (estado original):');
    for (const c of cil) console.log(`  ${c.numero_serie}: ${c.estado} · sucursal=${c.sucursal_actual_id}`);
    const casos = [caso1, caso2, caso3, caso4];
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
  for (let i = 1; i <= 4; i++) {
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
