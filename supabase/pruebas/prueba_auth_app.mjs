/**
 * Prueba de extremo a extremo del flujo de Supabase Auth de la app (login,
 * persistencia, respaldo offline y RLS), motivada por el bug del 30-10-2026:
 * la app consultaba `camiones` en el arranque antes de tener sesión y, sin
 * try/catch, la excepción de RLS tumbaba la app antes de mostrar el login.
 *
 * ESTRUCTURA. Reimplementa en JS plano la misma lógica de
 * `App/src/datos/repositorioSupabase.ts`, `App/src/datos/cacheSesion.ts` y el
 * efecto inicial de `App/src/estado/sesion.tsx` (`resolverUsuario`,
 * `esErrorDeRed`, `arrancar`, el caché en AsyncStorage). No importa esos
 * archivos TypeScript directamente para no acoplar la prueba al bundler de
 * Expo; a cambio, **si se cambia esa lógica en la app, hay que replicar el
 * cambio acá a mano**. Donde difieren, manda la app: esto es una prueba, no
 * la fuente de verdad.
 *
 * CÓMO SE USA
 *
 *   1. Copiar `.env.example` a `.env` en esta carpeta y completar las ocho
 *      variables, incluida una cuenta en `auth.users` SIN fila en
 *      `public.usuarios` (`SINFILA_EMAIL`/`SINFILA_PASSWORD`) para el caso 3.
 *   2. `npm i @supabase/supabase-js` (en cualquier carpeta con `node_modules`
 *      en su ruta; este archivo no trae uno propio).
 *   3. `node prueba_auth_app.mjs`, con `npx supabase link --project-ref
 *      <ref>` ya hecho: el caso 4 corre `supabase db query --linked` para
 *      inhabilitar y restaurar a `prueba.b` temporalmente.
 *
 * ⚠️ El caso 4 pone `activo = false` en la fila de `TEC_B_EMAIL` y la
 * restaura en un `finally`, pero si el proceso muere a mitad (kill -9, corte
 * de luz) la fila puede quedar inhabilitada. El propio script verifica al
 * final con un `select` y avisa si no pudo restaurar.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Permite que el script funcione recién clonado (.env en esta carpeta) y
// también en esta sesión de trabajo, donde las credenciales de prueba viven
// en el checkout de `FPC-Mobile`, no en el de `FPC-Mobile-capstone`.
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

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEC_A_EMAIL,
  TEC_A_PASSWORD,
  TEC_B_EMAIL,
  TEC_B_PASSWORD,
  SINFILA_EMAIL,
  SINFILA_PASSWORD,
} = process.env;

for (const [clave, valor] of Object.entries({
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TEC_A_EMAIL,
  TEC_A_PASSWORD,
  TEC_B_EMAIL,
  TEC_B_PASSWORD,
  SINFILA_EMAIL,
  SINFILA_PASSWORD,
})) {
  if (!valor) {
    console.error(`Falta ${clave} en ${rutaEnvUsada}. Ver .env.example.`);
    process.exit(1);
  }
}

// La prueba del caso 4 corre `supabase db query --linked`, que necesita cwd
// en la raíz del repo (donde vive `supabase/config.toml`). Se calcula desde
// la ubicación real del script, con una ruta fija de respaldo por si este
// archivo se ejecuta copiado a otra carpeta (p. ej. para heredar
// `node_modules`).
function resolverRaizRepo() {
  const candidata = path.resolve(AQUI, '..', '..');
  if (existsSync(path.join(candidata, 'supabase', 'config.toml'))) return candidata;
  return 'C:/Users/Nicolas/Desktop/Proyectos/FPC-Mobile-capstone';
}
const RAIZ_REPO = resolverRaizRepo();

function dbQuery(sql) {
  // `execFileSync` con un .cmd (npx en Windows) falla con EINVAL sin shell, y
  // con shell:true el array de argumentos se vuelve a tokenizar y rompe el
  // SQL. Se arma el comando a mano y se entrecomilla una sola vez: no hay
  // comillas dobles en nuestro SQL, solo simples (literal del correo).
  const comando = `npx supabase db query --linked "${sql.replace(/"/g, '\\"')}"`;
  const salida = execSync(comando, { cwd: RAIZ_REPO, encoding: 'utf8' });
  return JSON.parse(salida.slice(salida.indexOf('{')));
}

/* --------------------------------------------- Almacén en memoria (AsyncStorage) */

function crearAlmacen() {
  const datos = new Map();
  return {
    async getItem(clave) {
      return datos.has(clave) ? datos.get(clave) : null;
    },
    async setItem(clave, valor) {
      datos.set(clave, valor);
    },
    async removeItem(clave) {
      datos.delete(clave);
    },
  };
}

/* --------------------------------------------------- Fetch con falla simulada */

let offline = false;
async function fetchConFalla(...args) {
  if (offline) throw new TypeError('fetch failed');
  return fetch(...args);
}

function crearCliente(storage) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchConFalla },
  });
}

/* ------------------------------------------- Caché de perfil y camión (cacheSesion.ts) */

const CLAVE_USUARIO = 'fpc.cacheSesion.usuario';
const CLAVE_CAMION = 'fpc.cacheSesion.camion';

async function cacheGuardarUsuario(storage, usuario) {
  await storage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}
async function cacheLeerUsuario(storage) {
  const v = await storage.getItem(CLAVE_USUARIO);
  return v ? JSON.parse(v) : null;
}
async function cacheGuardarCamion(storage, camion) {
  if (camion) await storage.setItem(CLAVE_CAMION, JSON.stringify(camion));
  else await storage.removeItem(CLAVE_CAMION);
}
async function cacheLeerCamion(storage) {
  const v = await storage.getItem(CLAVE_CAMION);
  return v ? JSON.parse(v) : null;
}
async function cacheBorrar(storage) {
  await storage.removeItem(CLAVE_USUARIO);
  await storage.removeItem(CLAVE_CAMION);
}

/* ------------------------------------------------- repositorioSupabase.ts (réplica) */

class ErrorRed extends Error {}

function esErrorDeRed(mensaje) {
  const m = (mensaje ?? '').toLowerCase();
  return (
    m.includes('network') || m.includes('fetch') || m.includes('failed to connect') || m.includes('timeout')
  );
}

function mensajeErrorAuth(error) {
  if (error && typeof error.message === 'string') {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (esErrorDeRed(msg)) return 'Sin conexión. Conéctate para iniciar sesión.';
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

async function resolverUsuario(supabase, storage, authUserId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nombre,rol,camion_jornada_id,activo')
    .eq('id', authUserId)
    .maybeSingle();

  if (error) {
    if (esErrorDeRed(error.message)) throw new ErrorRed(error.message);
    await supabase.auth.signOut();
    await cacheBorrar(storage);
    throw new Error('No se pudo verificar tu cuenta. Intenta de nuevo.');
  }
  if (!data) {
    await supabase.auth.signOut();
    await cacheBorrar(storage);
    throw new Error('Tu cuenta no está habilitada en el sistema. Contacta al administrador.');
  }
  if (!data.activo) {
    await supabase.auth.signOut();
    await cacheBorrar(storage);
    throw new Error('Tu cuenta está deshabilitada. Contacta al administrador.');
  }

  const usuario = {
    id: data.id,
    nombre: data.nombre,
    usuario: authUserId,
    rol: data.rol,
    camionAsignadoId: data.camion_jornada_id,
  };
  await cacheGuardarUsuario(storage, usuario);
  return usuario;
}

async function iniciarSesion(supabase, storage, correo, clave) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
  if (error || !data.user) throw new Error(mensajeErrorAuth(error));
  return resolverUsuario(supabase, storage, data.user.id);
}

async function cerrarSesion(supabase, storage) {
  await supabase.auth.signOut();
  await cacheBorrar(storage);
}

async function sesionActual(supabase, storage) {
  const { data } = await supabase.auth.getSession();
  const authUserId = data.session?.user.id;
  if (!authUserId) return null;
  try {
    return await resolverUsuario(supabase, storage, authUserId);
  } catch (error) {
    if (error instanceof ErrorRed) return cacheLeerUsuario(storage);
    return null;
  }
}

let llamadasCamiones = 0;
function mapearCamion(fila) {
  return {
    id: fila.id,
    patente: fila.patente,
    descripcion: fila.descripcion ?? '',
    capacidadCilindros: fila.capacidad_cilindros,
    activo: fila.activo,
  };
}
async function camionesListar(supabase) {
  llamadasCamiones++;
  const { data, error } = await supabase
    .from('camiones')
    .select('id,patente,descripcion,capacidad_cilindros,activo')
    .eq('activo', true);
  if (error) {
    console.warn('[prueba] camiones.listar falló:', error.message, error.code);
    throw new Error('No se pudo cargar la lista de camiones.');
  }
  return data.map(mapearCamion);
}

/* ---------------------------------------------- efecto inicial de sesion.tsx (réplica) */

async function arrancar(supabase, storage) {
  try {
    const sesion = await sesionActual(supabase, storage);
    if (!sesion) return { usuario: null, camion: null };
    let camion;
    try {
      const camiones = await camionesListar(supabase);
      camion = camiones.find((c) => c.id === sesion.camionAsignadoId) ?? null;
      await cacheGuardarCamion(storage, camion);
    } catch {
      camion = await cacheLeerCamion(storage);
    }
    return { usuario: sesion, camion };
  } catch {
    return { usuario: null, camion: null };
  }
}

async function simularLoginDeApp(supabase, storage, correo, clave) {
  const usuario = await iniciarSesion(supabase, storage, correo, clave);
  let camion;
  try {
    const camiones = await camionesListar(supabase);
    camion = camiones.find((c) => c.id === usuario.camionAsignadoId) ?? null;
    await cacheGuardarCamion(storage, camion);
  } catch {
    camion = await cacheLeerCamion(storage);
  }
  return { usuario, camion };
}

/* ------------------------------------------------------------------------- Casos */

let clienteA;
let storageA;

async function caso0() {
  llamadasCamiones = 0;
  const storage0 = crearAlmacen();
  const cliente0 = crearCliente(storage0);
  const resultado = await arrancar(cliente0, storage0);
  const ok = resultado.usuario === null && llamadasCamiones === 0;
  return ok
    ? { resultado: 'PASA', detalle: 'sin sesión; camiones.listar no se llamó; sin excepción' }
    : { resultado: 'FALLA', detalle: `usuario=${JSON.stringify(resultado.usuario)} llamadasCamiones=${llamadasCamiones}` };
}

async function caso1() {
  storageA = crearAlmacen();
  clienteA = crearCliente(storageA);
  const { usuario, camion } = await simularLoginDeApp(clienteA, storageA, TEC_A_EMAIL, TEC_A_PASSWORD);
  const ok = usuario.rol === 'tecnico' && !!camion;
  return ok
    ? { resultado: 'PASA', detalle: `rol=${usuario.rol}, camion=${camion.patente}` }
    : { resultado: 'FALLA', detalle: `rol=${usuario.rol}, camion=${camion ? camion.patente : 'null'}` };
}

async function caso2() {
  const storageX = crearAlmacen();
  const clienteX = crearCliente(storageX);
  try {
    await iniciarSesion(clienteX, storageX, TEC_A_EMAIL, `${TEC_A_PASSWORD}-mala`);
    return { resultado: 'FALLA', detalle: 'no lanzó error' };
  } catch (e) {
    const ok = e.message === 'Correo o contraseña incorrectos.';
    return ok ? { resultado: 'PASA', detalle: `"${e.message}"` } : { resultado: 'FALLA', detalle: `mensaje inesperado: "${e.message}"` };
  }
}

async function caso3() {
  const storageS = crearAlmacen();
  const clienteS = crearCliente(storageS);
  try {
    await iniciarSesion(clienteS, storageS, SINFILA_EMAIL, SINFILA_PASSWORD);
    return { resultado: 'FALLA', detalle: 'no lanzó error' };
  } catch (e) {
    const { data } = await clienteS.auth.getSession();
    const cerrada = !data.session;
    return cerrada
      ? { resultado: 'PASA', detalle: `rechazado: "${e.message}"; sesión cerrada` }
      : { resultado: 'FALLA', detalle: `mensaje="${e.message}" sesión cerrada=${cerrada}` };
  }
}

async function caso4() {
  const emailEscapado = TEC_B_EMAIL.replace(/'/g, "''");
  let resultadoCaso = { resultado: 'FALLA', detalle: 'no determinado' };
  let restaurado = false;
  try {
    dbQuery(`update public.usuarios set activo = false where id = (select id from auth.users where email = '${emailEscapado}');`);

    const storageB = crearAlmacen();
    const clienteB = crearCliente(storageB);
    let mensaje = null;
    let rechazado = false;
    try {
      await iniciarSesion(clienteB, storageB, TEC_B_EMAIL, TEC_B_PASSWORD);
    } catch (e) {
      rechazado = true;
      mensaje = e.message;
    }
    const { data: tras } = await clienteB.auth.getSession();
    const sesionCerrada = !tras.session;

    resultadoCaso =
      rechazado && sesionCerrada
        ? { resultado: 'PASA', detalle: `rechazado: "${mensaje}"; sesión cerrada` }
        : { resultado: 'FALLA', detalle: `rechazado=${rechazado} mensaje="${mensaje}" sesionCerrada=${sesionCerrada}` };
  } finally {
    try {
      dbQuery(`update public.usuarios set activo = true where id = (select id from auth.users where email = '${emailEscapado}');`);
      const verificacion = dbQuery(`select activo from public.usuarios where id = (select id from auth.users where email = '${emailEscapado}');`);
      restaurado = verificacion.rows?.[0]?.activo === true;
    } catch (e) {
      console.error('⚠️ No se pudo restaurar activo=true para prueba.b:', e.message);
    }
  }
  return { ...resultadoCaso, restaurado };
}

async function caso5() {
  // "Cliente nuevo" con el mismo almacenamiento: simula reabrir la app.
  const clienteA2 = crearCliente(storageA);
  const usuario = await sesionActual(clienteA2, storageA);
  return usuario
    ? { resultado: 'PASA', detalle: `restaurada sin pedir contraseña (rol=${usuario.rol})` }
    : { resultado: 'FALLA', detalle: 'no se restauró la sesión' };
}

async function caso6() {
  offline = true;
  try {
    const resultado = await arrancar(clienteA, storageA);
    const { data } = await clienteA.auth.getSession();
    const sesionSigueViva = !!data.session;
    const ok = !!resultado.usuario && !!resultado.camion && sesionSigueViva;
    return ok
      ? { resultado: 'PASA', detalle: 'perfil y camión devueltos desde caché; la sesión no se cerró' }
      : {
          resultado: 'FALLA',
          detalle: `usuario=${!!resultado.usuario} camion=${!!resultado.camion} sesionViva=${sesionSigueViva}`,
        };
  } finally {
    offline = false;
  }
}

async function caso7() {
  offline = true;
  try {
    const storageX = crearAlmacen();
    const clienteX = crearCliente(storageX);
    try {
      await iniciarSesion(clienteX, storageX, TEC_A_EMAIL, TEC_A_PASSWORD);
      return { resultado: 'FALLA', detalle: 'no lanzó error estando sin conexión' };
    } catch (e) {
      const ok = e.message === 'Sin conexión. Conéctate para iniciar sesión.';
      return ok
        ? { resultado: 'PASA', detalle: `"${e.message}"` }
        : { resultado: 'FALLA', detalle: `mensaje inesperado (¿lo tomó por credenciales?): "${e.message}"` };
    }
  } finally {
    offline = false;
  }
}

async function caso8() {
  await cerrarSesion(clienteA, storageA);
  const { data } = await clienteA.auth.getSession();
  const u = await cacheLeerUsuario(storageA);
  const c = await cacheLeerCamion(storageA);
  const ok = !data.session && !u && !c;
  return ok
    ? { resultado: 'PASA', detalle: 'getSession()=null; perfil y camión de caché borrados' }
    : { resultado: 'FALLA', detalle: `session=${!!data.session} usuarioCache=${!!u} camionCache=${!!c}` };
}

async function caso9y10() {
  const storageZ = crearAlmacen();
  const clienteZ = crearCliente(storageZ);
  const usuario = await iniciarSesion(clienteZ, storageZ, TEC_A_EMAIL, TEC_A_PASSWORD);

  // Caso 9: intento de UPDATE de su propio camion_jornada_id.
  const valorFalso = crypto.randomUUID();
  await clienteZ.from('usuarios').update({ camion_jornada_id: valorFalso }).eq('id', usuario.id);
  const { data: filaTrasUpdate } = await clienteZ
    .from('usuarios')
    .select('camion_jornada_id')
    .eq('id', usuario.id)
    .maybeSingle();
  const sinCambio = filaTrasUpdate?.camion_jornada_id !== valorFalso;
  const resultado9 = sinCambio
    ? {
        resultado: 'PASA',
        detalle: `UPDATE bloqueado por RLS (afectó 0 filas); camion_jornada_id sigue en ${filaTrasUpdate?.camion_jornada_id ?? 'null'}`,
      }
    : { resultado: 'FALLA', detalle: 'el técnico pudo cambiar su propio camion_jornada_id' };

  // Caso 10: qué filas de `usuarios` ve, sin filtro propio.
  const { data: visibles, error } = await clienteZ.from('usuarios').select('id,nombre,rol');
  const resultado10 = error
    ? { resultado: 'FALLA', detalle: error.message }
    : {
        resultado: visibles.length === 1 && visibles[0].id === usuario.id ? 'PASA' : 'FALLA',
        detalle: `ve ${visibles.length} fila(s): ${visibles.map((v) => `${v.nombre} (${v.rol})`).join(', ')}`,
      };

  await cerrarSesion(clienteZ, storageZ);
  return { resultado9, resultado10 };
}

/* ------------------------------------------------------------------------- Main */

const DESCRIPCIONES = {
  0: 'Arranque sin sesión',
  1: 'Login correcto (prueba.a)',
  2: 'Contraseña incorrecta',
  3: 'Usuario sin fila en usuarios (SINFILA)',
  4: 'Usuario inactivo (prueba.b)',
  5: 'Persistencia entre "reinicios"',
  6: 'Offline con sesión guardada',
  7: 'Login sin conexión',
  8: 'cerrarSesion limpia todo',
  9: 'Camión de solo lectura (UPDATE bloqueado)',
  10: 'Qué filas de usuarios ve un técnico',
};

async function main() {
  console.log(`(usando .env de: ${rutaEnvUsada})\n`);
  const resultados = {};
  resultados[0] = await caso0();
  resultados[1] = await caso1();
  resultados[2] = await caso2();
  resultados[3] = await caso3();
  resultados[4] = await caso4();
  resultados[5] = await caso5();
  resultados[6] = await caso6();
  resultados[7] = await caso7();
  resultados[8] = await caso8();
  const { resultado9, resultado10 } = await caso9y10();
  resultados[9] = resultado9;
  resultados[10] = resultado10;

  console.log('\n== Resultados ==\n');
  for (let i = 0; i <= 10; i++) {
    const r = resultados[i];
    console.log(`Caso ${i} · ${DESCRIPCIONES[i]}: ${r.resultado}`);
    console.log(`  ${r.detalle}`);
  }

  console.log(
    `\nprueba.b (${TEC_B_EMAIL}) quedó con activo=true: ${resultados[4].restaurado ? 'sí, confirmado con select' : 'NO — REVISAR MANUALMENTE'}`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR inesperado:', e);
  process.exit(1);
});
