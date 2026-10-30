/**
 * Prueba exigida por la tarjeta «S4 · Habilitar Realtime sobre movimientos».
 *
 * QUE PRUEBA, Y POR QUE NO BASTA LO QUE YA SE VERIFICO. Que `movimientos` esté en la publicación
 * `supabase_realtime` confirma que Realtime está ENCENDIDO. No confirma que RESPETE RLS. Son
 * cosas distintas: si no las respeta, cualquier técnico suscrito recibe los movimientos de todos
 * los demás por el canal de tiempo real, sin que ninguna de las pruebas del Sprint 3 lo detecte,
 * porque todas miden consultas y ninguna mide suscripciones.
 *
 * COMO SE USA
 *
 *   1. Crear dos cuentas de técnico en Supabase (Authentication → Users) y su fila en
 *      `public.usuarios` con rol 'tecnico'. Las dos cosas: sin fila en `usuarios` el usuario
 *      entra pero no ve nada.
 *   2. Copiar `.env.example` a `.env` en esta carpeta y completar las seis variables.
 *   3. npm i @supabase/supabase-js
 *   4. node prueba_realtime_rls.mjs
 *
 * ⚠️ DEJA UN MOVIMIENTO DE PRUEBA EN LA BASE. `movimientos` no tiene política de DELETE para
 * ningún rol —es deliberado: el historial no se borra— así que la prueba no puede limpiarse
 * sola. Al terminar imprime el `uuid_local` y la sentencia para borrarlo desde el editor SQL del
 * panel, que corre como `postgres` y sí puede. Hacerlo: si no, queda un movimiento inventado en
 * el historial de un cilindro real.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

for (const linea of readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
  const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2];
}
const { SUPABASE_URL, SUPABASE_ANON_KEY,
        TEC_A_EMAIL, TEC_A_PASSWORD, TEC_B_EMAIL, TEC_B_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEC_A_EMAIL || !TEC_B_EMAIL) {
  console.error('Faltan variables en .env. Ver .env.example.');
  process.exit(1);
}

const nuevo = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function entrar(cliente, email, password, etiqueta) {
  const { data, error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${etiqueta} no pudo iniciar sesión: ${error.message}`);
  // Sin esto el socket viaja con la clave anónima y RLS no tiene a quién aplicar.
  await cliente.realtime.setAuth(data.session.access_token);
  const { data: fila, error: e2 } = await cliente
    .from('usuarios').select('id,nombre,rol').eq('id', data.user.id).single();
  if (e2 || !fila) throw new Error(`${etiqueta} no tiene fila en public.usuarios: no verá nada.`);
  if (fila.rol !== 'tecnico') throw new Error(`${etiqueta} tiene rol ${fila.rol}; la prueba necesita 'tecnico'.`);
  console.log(`  ${etiqueta}: ${fila.nombre} (${fila.rol})`);
  return data.user.id;
}

function suscribir(cliente, etiqueta, buzon) {
  return new Promise((resolve, reject) => {
    cliente.channel(`prueba-rls-${etiqueta}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movimientos' },
          (carga) => {
            buzon.push(carga.new);
            console.log(`  → ${etiqueta} recibió un evento: ${carga.new?.uuid_local ?? '(sin uuid)'}`);
          })
      .subscribe((estado, err) => {
        if (estado === 'SUBSCRIBED') resolve();
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') reject(err ?? new Error(estado));
      });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n== Prueba de RLS sobre Realtime ==\n');
const a = nuevo(), b = nuevo();
const recibidosA = [], recibidosB = [];
let uuidPrueba = null;

try {
  console.log('1. Iniciando sesión');
  const idA = await entrar(a, TEC_A_EMAIL, TEC_A_PASSWORD, 'Técnico A');
  await entrar(b, TEC_B_EMAIL, TEC_B_PASSWORD, 'Técnico B');

  console.log('\n2. Suscribiendo los dos al canal de movimientos');
  await Promise.all([suscribir(a, 'A', recibidosA), suscribir(b, 'B', recibidosB)]);
  console.log('  ambos suscritos');

  console.log('\n3. Buscando un cilindro y un camión reales');
  const { data: cil } = await a.from('cilindros').select('id,numero_serie').limit(1).single();
  const { data: cam } = await a.from('camiones').select('id,patente').limit(1).single();
  if (!cil || !cam) throw new Error('No hay cilindros o camiones cargados.');
  console.log(`  cilindro ${cil.numero_serie} · camión ${cam.patente}`);

  console.log('\n4. El técnico A registra una carga');
  uuidPrueba = randomUUID();
  const { error } = await a.from('movimientos').insert({
    uuid_local: uuidPrueba, tipo: 'carga', cilindro_id: cil.id, sucursal_id: null,
    usuario_id: idA, camion_id: cam.id,
    fecha_evento: new Date().toISOString(), codigo_origen: 'manual',
  });
  if (error) throw new Error(`No se pudo insertar: ${error.message}`);
  console.log(`  insertado ${uuidPrueba}`);

  console.log('\n5. Esperando 6 segundos los eventos…');
  await espera(6000);

  const vioA = recibidosA.some((m) => m.uuid_local === uuidPrueba);
  const vioB = recibidosB.some((m) => m.uuid_local === uuidPrueba);

  console.log('\n== Resultado ==');
  console.log(`  A ve su propio movimiento : ${vioA ? 'sí' : 'NO'}  (esperado: sí)`);
  console.log(`  B ve el movimiento de A   : ${vioB ? 'SÍ' : 'no'}  (esperado: no)`);

  if (vioB) {
    console.log('\n  ❌ FALLA. Realtime NO está aplicando RLS: un técnico recibe por el canal de');
    console.log('     tiempo real movimientos que no puede consultar por la API. El tablero del');
    console.log('     Sprint 6 y la app filtran de más, pero el dato ya salió del servidor.');
  } else if (!vioA) {
    console.log('\n  ⚠️  INCONCLUSO. Ni siquiera A recibió su propio movimiento: el problema está en');
    console.log('     la suscripción, no en RLS. Revisar que la tabla esté en la publicación y que');
    console.log('     el proyecto tenga Realtime habilitado antes de sacar conclusiones.');
  } else {
    console.log('\n  ✅ APROBADA. RLS se aplica también en Realtime: el aislamiento entre técnicos');
    console.log('     no se filtra por el canal de tiempo real.');
  }
} catch (e) {
  console.error('\n  ERROR:', e.message);
} finally {
  if (uuidPrueba) {
    console.log('\n== Limpieza (hacerla) ==');
    console.log('  `movimientos` no admite DELETE por la API: correr esto en el editor SQL del panel.');
    console.log(`  delete from movimientos where uuid_local = '${uuidPrueba}';`);
  }
  await a.removeAllChannels(); await b.removeAllChannels();
  await a.auth.signOut(); await b.auth.signOut();
  process.exit(0);
}
