/**
 * Prueba de extremo a extremo del catálogo de solo lectura desde Supabase
 * (clientes, sucursales, cilindros), de la tarea que reemplaza
 * `datosEjemplo.ts` por Supabase en la app.
 *
 * ESTRUCTURA: mismo patrón que `prueba_auth_app.mjs` (carga de `.env`, helper
 * `dbQuery` para mutaciones puntuales de administrador vía `supabase db query
 * --linked`, tabla de resultados PASA/FALLA al final). No importa
 * `repositorioSupabaseCatalogo.ts`: ejecuta en JS plano las mismas consultas
 * que hace ese repositorio, autenticado como un técnico real, para confirmar
 * que RLS y los GRANT dejan pasar lo que la app necesita. Si se cambia la
 * forma de esas consultas en la app, hay que replicar el cambio acá a mano.
 *
 * CÓMO SE USA
 *   1. Completar `supabase/pruebas/.env` con TEC_A_EMAIL/TEC_A_PASSWORD (ya
 *      existen del Sprint 5, ver `.env.example`).
 *   2. `npx supabase link --project-ref <ref>` hecho: los casos 6 y 7 usan
 *      `supabase db query --linked` para fijar y restaurar un valor de
 *      prueba (codigo_barras) en un cilindro real; no tocan nada que la app
 *      no pueda deshacer.
 *   3. `npm i @supabase/supabase-js` (en cualquier carpeta con `node_modules`
 *      en su ruta; este archivo no trae uno propio).
 *   4. `node prueba_catalogo_app.mjs`.
 *
 * ⚠️ El caso 6 pone un `codigo_barras` de prueba en un cilindro real y lo
 * restaura a null en un `finally`, pero si el proceso muere a mitad (kill -9,
 * corte de luz) puede quedar con el valor de prueba. El propio script
 * verifica al final con un `select` y avisa si no pudo restaurar.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Igual que en `prueba_auth_app.mjs`: funciona recién clonado (.env en esta
// carpeta) y también en esta sesión de trabajo, donde las credenciales viven
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

function dbQuery(sql) {
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

function crearCliente(storage) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/* --------------------------------------- réplica mínima de normalizar() de la app */

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/* ------------------------------------------------------------------------- Casos */

let tecnico;

async function caso1_sinSesion() {
  const anonimo = crearCliente(crearAlmacen());
  const { data, error } = await anonimo.from('clientes').select('id').limit(1);
  const ok = error !== null || (data !== null && data.length === 0);
  return ok
    ? {
        resultado: 'PASA',
        detalle: error ? `consulta rechazada (código ${error.code})` : 'sin filas visibles',
      }
    : { resultado: 'FALLA', detalle: `vio ${data?.length ?? 0} fila(s) de clientes sin sesión` };
}

async function caso2_login() {
  tecnico = crearCliente(crearAlmacen());
  const { data, error } = await tecnico.auth.signInWithPassword({
    email: TEC_A_EMAIL,
    password: TEC_A_PASSWORD,
  });
  if (error || !data.user) {
    return { resultado: 'FALLA', detalle: `no se pudo autenticar: ${error?.message ?? 'sin usuario'}` };
  }
  return { resultado: 'PASA', detalle: `autenticado como técnico de prueba` };
}

async function caso3_catalogoActivo() {
  const [{ data: clientes, error: e1 }, { data: sucursales, error: e2 }] = await Promise.all([
    tecnico.from('clientes').select('id').eq('activo', true),
    tecnico.from('sucursales').select('id').eq('activo', true),
  ]);
  if (e1 || e2) {
    return { resultado: 'FALLA', detalle: `clientes: ${e1?.message ?? 'ok'} / sucursales: ${e2?.message ?? 'ok'}` };
  }
  const ok = clientes.length > 0 && sucursales.length > 0;
  return ok
    ? { resultado: 'PASA', detalle: `${clientes.length} cliente(s) activo(s), ${sucursales.length} sucursal(es) activa(s)` }
    : { resultado: 'FALLA', detalle: `clientes=${clientes.length} sucursales=${sucursales.length}` };
}

async function caso4_buscarSinTildes() {
  const { data, error } = await tecnico.from('clientes').select('nombre,rut').eq('activo', true);
  if (error) return { resultado: 'FALLA', detalle: error.message };
  const objetivo = 'munoz'; // sin tilde: debe igual encontrar nombres con "Muñoz"
  const encontrados = data.filter((c) => normalizar(c.nombre).includes(objetivo));
  const ok = encontrados.length > 0;
  return ok
    ? {
        resultado: 'PASA',
        detalle: `"${objetivo}" encontró ${encontrados.length} cliente(s); p.ej. "${encontrados[0].nombre}"`,
      }
    : { resultado: 'FALLA', detalle: `"${objetivo}" no encontró ningún cliente activo` };
}

async function caso5_cilindroPorSerieConRuido() {
  // Se busca un envase sin espacios propios en la serie, para no confundir el
  // espacio que agrega la prueba con uno que ya trae el dato real.
  const { data, error } = await tecnico
    .from('cilindros')
    .select('numero_serie')
    .not('numero_serie', 'ilike', '% %')
    .order('numero_serie')
    .limit(1);
  if (error || !data || data.length === 0) {
    return {
      resultado: 'FALLA',
      detalle: error ? error.message : 'no se encontró un cilindro de prueba sin espacios en la serie',
    };
  }
  const serieReal = data[0].numero_serie;
  const mitad = Math.ceil(serieReal.length / 2);
  const conRuido = `  ${serieReal.slice(0, mitad).toLowerCase()} ${serieReal.slice(mitad).toLowerCase()}  `;
  const serieNormalizada = conRuido.toUpperCase().replace(/\s+/g, '');

  const { data: hallado, error: errorBusqueda } = await tecnico
    .from('cilindros')
    .select('numero_serie')
    .eq('serie_normalizada', serieNormalizada)
    .maybeSingle();

  const ok = !errorBusqueda && hallado?.numero_serie === serieReal;
  return ok
    ? { resultado: 'PASA', detalle: `"${conRuido.trim()}" encontró la serie ${serieReal}` }
    : {
        resultado: 'FALLA',
        detalle: `buscó "${conRuido}": error=${errorBusqueda?.message ?? 'ninguno'}, encontrado=${hallado?.numero_serie ?? 'nada'}`,
      };
}

async function caso6_cilindroPorCodigoBarras() {
  // El parque migrado no trae codigo_barras (todo llegó por numero_serie), así
  // que se fija uno de prueba en un cilindro real y se restaura al terminar,
  // igual que el caso 4 de `prueba_auth_app.mjs` con `activo`.
  const codigoPrueba = 'PRUEBA-CB-0001';
  let cilindroId = null;
  let serieOriginal = null;
  let restaurado = false;

  try {
    const disponible = dbQuery(
      'select id, numero_serie from public.cilindros where codigo_barras is null order by numero_serie limit 1;',
    );
    const fila = disponible.rows?.[0];
    if (!fila) {
      return { resultado: 'FALLA', detalle: 'no hay cilindros sin codigo_barras para la prueba', restaurado: true };
    }
    cilindroId = fila.id;
    serieOriginal = fila.numero_serie;

    dbQuery(`update public.cilindros set codigo_barras = '${codigoPrueba}' where id = '${cilindroId}';`);

    const { data, error } = await tecnico
      .from('cilindros')
      .select('numero_serie,codigo_barras')
      .eq('codigo_barras', codigoPrueba)
      .maybeSingle();

    const ok = !error && data?.numero_serie === serieOriginal;
    return {
      ...(ok
        ? { resultado: 'PASA', detalle: `codigo_barras "${codigoPrueba}" encontró la serie ${serieOriginal}` }
        : {
            resultado: 'FALLA',
            detalle: `error=${error?.message ?? 'ninguno'} encontrado=${JSON.stringify(data)}`,
          }),
    };
  } finally {
    if (cilindroId) {
      try {
        dbQuery(`update public.cilindros set codigo_barras = null where id = '${cilindroId}';`);
        const verificacion = dbQuery(`select codigo_barras from public.cilindros where id = '${cilindroId}';`);
        restaurado = verificacion.rows?.[0]?.codigo_barras === null;
      } catch (e) {
        console.error('⚠️ No se pudo restaurar codigo_barras=null:', e.message);
      }
    } else {
      restaurado = true;
    }
    // Se adjunta al resultado ya devuelto no es posible desde un finally;
    // se imprime aparte en main(), igual que prueba.b en prueba_auth_app.mjs.
    caso6_cilindroPorCodigoBarras.restaurado = restaurado;
  }
}

async function caso7_productoPRO() {
  const { data: producto, error: errorProducto } = await tecnico
    .from('productos')
    .select('id')
    .eq('envase_codigo', 'PRO')
    .maybeSingle();
  if (errorProducto || !producto) {
    return { resultado: 'FALLA', detalle: `no se encontró el producto PRO: ${errorProducto?.message ?? 'sin fila'}` };
  }

  const { data, error } = await tecnico
    .from('cilindros')
    .select('numero_serie,producto:productos(capacidad,unidad,tipo_envase)')
    .eq('producto_id', producto.id)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return { resultado: 'FALLA', detalle: `no se encontró un cilindro del código PRO: ${error?.message ?? 'ninguno'}` };
  }

  const prod = Array.isArray(data.producto) ? data.producto[0] : data.producto;
  const ok = prod != null && prod.capacidad === null && prod.unidad === null;
  return ok
    ? {
        resultado: 'PASA',
        detalle: `cilindro ${data.numero_serie}: capacidad=null, unidad=null (mapea a "Propiedad del cliente", no revienta)`,
      }
    : { resultado: 'FALLA', detalle: `capacidad=${prod?.capacidad} unidad=${prod?.unidad}` };
}

/* ------------------------------------------------------------------------- Main */

const DESCRIPCIONES = {
  1: 'Sin sesión no ve el catálogo',
  2: 'Login del técnico de prueba',
  3: 'Clientes y sucursales activos visibles',
  4: 'buscar() de clientes ignora tildes',
  5: 'Cilindro por serie con espacios y minúsculas',
  6: 'Cilindro por codigo_barras',
  7: 'Cilindro del código PRO (capacidad null) no rompe el mapeo',
};

async function main() {
  console.log(`(usando .env de: ${rutaEnvUsada})\n`);
  const resultados = {};
  resultados[1] = await caso1_sinSesion();
  resultados[2] = await caso2_login();
  resultados[3] = await caso3_catalogoActivo();
  resultados[4] = await caso4_buscarSinTildes();
  resultados[5] = await caso5_cilindroPorSerieConRuido();
  resultados[6] = await caso6_cilindroPorCodigoBarras();
  resultados[7] = await caso7_productoPRO();

  console.log('\n== Resultados ==\n');
  for (let i = 1; i <= 7; i++) {
    const r = resultados[i];
    console.log(`Caso ${i} · ${DESCRIPCIONES[i]}: ${r.resultado}`);
    console.log(`  ${r.detalle}`);
  }

  console.log(
    `\nCilindro de prueba (caso 6) quedó con codigo_barras=null: ${
      caso6_cilindroPorCodigoBarras.restaurado ? 'sí, confirmado con select' : 'NO — REVISAR MANUALMENTE'
    }`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR inesperado:', e);
  process.exit(1);
});
