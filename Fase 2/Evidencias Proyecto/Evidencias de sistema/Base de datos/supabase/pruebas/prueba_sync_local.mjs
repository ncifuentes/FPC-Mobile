/**
 * Prueba sin teléfono ni red de la lógica local de sincronización:
 *  - la proyección del estado de los cilindros (`App/src/datos/proyeccion.ts`);
 *  - el ciclo de envío y folio (`App/src/sync/procesarCola.ts`) contra la cola
 *    en memoria (`colaMemoria.ts`) y un servidor FALSO que simula red caída,
 *    rechazos por constraint/RLS y la función de folio.
 *
 * Importa los `.ts` reales de la app: Node 24 quita los tipos solo. Los imports
 * relativos de la app no llevan extensión (estilo Metro), así que se registra un
 * hook que prueba con `.ts` cuando el archivo sin extensión no existe.
 *
 * La prueba contra el proyecto real (RLS, triggers, folio) es
 * `prueba_sync_movimientos.mjs`.
 *
 * CÓMO SE USA: `node supabase/pruebas/prueba_sync_local.mjs` (sin .env, sin red).
 */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'App', 'src');
const cargar = (rel) => import(pathToFileURL(path.join(APP, rel)).href);

const { proyectarCilindro, ultimoPorCilindro, combinarHistorial } = await cargar('datos/proyeccion.ts');
const { crearColaMemoria } = await cargar('sync/colaMemoria.ts');
const { procesarCola } = await cargar('sync/procesarCola.ts');

/* ----------------------------------------------------------------- utilidades */

const resultados = [];
function caso(nombre, ok, detalle = '') {
  resultados.push({ nombre, resultado: ok ? 'PASA' : 'FALLA', detalle });
}

const USUARIO = 'u-tecnico';
const CAMION = 'camion-1';
const SUC_A = 'sucursal-a';

let secuencia = 0;
function mov(tipo, cilindroId, minuto, extra = {}) {
  secuencia += 1;
  return {
    uuidLocal: `00000000-0000-0000-0000-${String(secuencia).padStart(12, '0')}`,
    tipo,
    cilindroId,
    sucursalId: tipo === 'carga' ? null : SUC_A,
    usuarioId: USUARIO,
    camionId: CAMION,
    fechaEvento: new Date(Date.UTC(2026, 10, 2, 12, minuto)).toISOString(),
    fechaSync: null,
    origenCodigo: 'escaner',
    despachoId: tipo === 'carga' ? null : 'despacho-1',
    codigoCilindro: cilindroId.toUpperCase(),
    nombreCliente: tipo === 'carga' ? null : 'Cliente A',
    nombreSucursal: tipo === 'carga' ? null : 'Principal',
    ...extra,
  };
}

function cilindroServidor(id, estado = 'en_planta', extra = {}) {
  return {
    id,
    codigo: id.toUpperCase(),
    numeroSerie: id.toUpperCase(),
    codigoBarras: null,
    tipoEnvase: 'cilindro',
    tipoGas: 'Oxígeno',
    capacidadValor: 10,
    capacidadUnidad: 'm3',
    estado,
    sucursalActualId: null,
    enClienteDesde: null,
    codigoGenerado: false,
    ...extra,
  };
}

/**
 * Servidor falso: guarda filas por uuid (on conflict do nothing), rechaza una
 * entrega sin sucursal con 23514, simula red caída con status 0, y numera
 * despachos como `asignar_folio_despacho` (idempotente, exige que estén todos).
 */
function crearServidorFalso() {
  const filas = new Map();
  const folios = new Map();
  let siguienteFolio = 100;
  const s = {
    filas,
    folios,
    redCaida: false,
    folioConRedCaida: false,
    llamadasInsertar: 0,
    llamadasFolio: 0,
    /** uuids de cada llamada a `asignarFolio`, en orden. */
    gruposFolio: [],
    async insertar(lote) {
      s.llamadasInsertar += 1;
      if (s.redCaida) return { message: 'TypeError: Network request failed', code: '', status: 0 };
      const malo = lote.find((m) => m.tipo !== 'carga' && m.sucursalId === null);
      if (malo) {
        return {
          message: 'new row violates check constraint "movimientos_sucursal_coherente"',
          code: '23514',
          status: 400,
        };
      }
      for (const m of lote) if (!filas.has(m.uuidLocal)) filas.set(m.uuidLocal, { ...m });
      return null;
    },
    async asignarFolio(uuids) {
      s.llamadasFolio += 1;
      s.gruposFolio.push([...uuids]);
      if (s.folioConRedCaida) return { message: 'FetchError: timeout', code: '', status: 0 };
      if (uuids.some((u) => !filas.has(u))) {
        return { message: 'Faltan movimientos en el servidor', code: 'P0001', status: 400 };
      }
      const existente = uuids.map((u) => folios.get(u)).find((f) => f !== undefined);
      const folio = existente ?? siguienteFolio++;
      uuids.forEach((u) => folios.set(u, folio));
      return null;
    },
  };
  return s;
}

/* ---------------------------------------------------------- 1. proyección */

{
  const c1 = cilindroServidor('c1');
  const carga = mov('carga', 'c1', 0);
  const p1 = proyectarCilindro(c1, ultimoPorCilindro([carga]).get('c1'));
  caso(
    'Proyección: carga pendiente + servidor en_planta → en_camion',
    p1.estado === 'en_camion' && p1.sucursalActualId === null,
    `estado=${p1.estado}`,
  );

  const entrega = mov('entrega', 'c1', 30);
  const p2 = proyectarCilindro(c1, ultimoPorCilindro([carga, entrega]).get('c1'));
  caso(
    'Proyección: luego entrega pendiente → en_cliente con sucursal y fecha',
    p2.estado === 'en_cliente' && p2.sucursalActualId === SUC_A && p2.enClienteDesde === entrega.fechaEvento,
    `estado=${p2.estado} sucursal=${p2.sucursalActualId}`,
  );

  // El orden de llegada no importa: manda la fecha_evento (como el trigger).
  const p3 = proyectarCilindro(c1, ultimoPorCilindro([entrega, carga]).get('c1'));
  caso('Proyección: manda la fecha_evento, no el orden en la cola', p3.estado === 'en_cliente', `estado=${p3.estado}`);

  // Servidor con el envase en un cliente desde DESPUÉS del pendiente: gana el servidor.
  const enClienteDespues = cilindroServidor('c1', 'en_cliente', {
    sucursalActualId: 'otra',
    enClienteDesde: new Date(Date.UTC(2026, 10, 2, 13, 0)).toISOString(),
  });
  const p4 = proyectarCilindro(enClienteDespues, ultimoPorCilindro([carga]).get('c1'));
  caso(
    'Proyección: si el servidor es más reciente, no se contradice',
    p4.estado === 'en_cliente' && p4.sucursalActualId === 'otra',
    `estado=${p4.estado}`,
  );

  // Ya sincronizado: el servidor ya dice en_cliente con la misma entrega → mismo resultado.
  const sincronizado = cilindroServidor('c1', 'en_cliente', {
    sucursalActualId: SUC_A,
    enClienteDesde: entrega.fechaEvento,
  });
  const p5 = proyectarCilindro(sincronizado, ultimoPorCilindro([entrega]).get('c1'));
  caso(
    'Proyección: aplicada sobre un dato ya sincronizado no lo cambia',
    JSON.stringify(p5) === JSON.stringify(sincronizado),
  );

  const det = (m, envio) => ({ ...m, nombreUsuario: 'X', envio, errorEnvio: null });
  const combinado = combinarHistorial(
    [det({ ...entrega, fechaSync: 'x' }, 'enviado')],
    [det(carga, 'pendiente'), det(entrega, 'enviado')],
  );
  caso(
    'Historial: servidor + cola sin duplicar por uuid_local, ordenado por fecha',
    combinado.length === 2 &&
      combinado[0].uuidLocal === carga.uuidLocal &&
      combinado[1].fechaSync === 'x',
    `n=${combinado.length}`,
  );
}

/* --------------------------------------------- 2. ciclo de envío y folio */

{
  // Red caída: la cola no se toca.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  srv.redCaida = true;
  await cola.encolar(mov('carga', 'c1', 0));
  await cola.encolar(mov('entrega', 'c1', 10));
  const r = await procesarCola(cola, srv, USUARIO);
  const items = await cola.listar();
  caso(
    'Sync: error de red → cola intacta, se corta el ciclo',
    r.cortadoPorRed && items.length === 2 && items.every((m) => m.estadoEnvio === 'pendiente'),
    `cortado=${r.cortadoPorRed} estados=${items.map((m) => m.estadoEnvio)}`,
  );

  // Vuelve la red: carga se quita al insertar, la entrega pide folio y se quita.
  srv.redCaida = false;
  const r2 = await procesarCola(cola, srv, USUARIO);
  caso(
    'Sync: al volver la red se inserta todo, carga sin folio, despacho con 1 folio',
    srv.filas.size === 2 && r2.folios === 1 && (await cola.listar()).length === 0,
    `filas=${srv.filas.size} folios=${r2.folios}`,
  );
}

{
  // Un movimiento malo no bloquea a los demás: se aísla partiendo el lote.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  const buenos = [mov('carga', 'c1', 0), mov('carga', 'c2', 1), mov('carga', 'c3', 2), mov('carga', 'c4', 3)];
  const malo = mov('entrega', 'c5', 4, { sucursalId: null, despachoId: 'despacho-2' });
  for (const m of [...buenos.slice(0, 2), malo, ...buenos.slice(2)]) await cola.encolar(m);
  const r = await procesarCola(cola, srv, USUARIO);
  const quedan = await cola.listar();
  caso(
    'Sync: rechazo por constraint aísla al malo; el resto entra',
    srv.filas.size === 4 &&
      r.rechazados === 1 &&
      quedan.length === 1 &&
      quedan[0].uuidLocal === malo.uuidLocal &&
      quedan[0].estadoEnvio === 'rechazado' &&
      quedan[0].errorEnvio?.includes('movimientos_sucursal_coherente'),
    `insertados=${srv.filas.size} rechazados=${r.rechazados} quedan=${quedan.map((m) => m.estadoEnvio)}`,
  );

  const antes = srv.llamadasInsertar;
  await procesarCola(cola, srv, USUARIO);
  caso(
    'Sync: el rechazado no se reintenta solo ni bloquea ciclos siguientes',
    srv.llamadasInsertar === antes && (await cola.contar()).conError === 1,
    `llamadas extra=${srv.llamadasInsertar - antes}`,
  );
}

{
  // Insert OK pero folio sin red: no se reenvía, solo se reintenta el folio.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  const e1 = mov('entrega', 'c1', 0, { despachoId: 'd-x' });
  const e2 = mov('retiro', 'c2', 1, { despachoId: 'd-x' });
  await cola.encolar(e1);
  await cola.encolar(e2);
  srv.folioConRedCaida = true;
  const r = await procesarCola(cola, srv, USUARIO);
  const intermedio = await cola.listar();
  caso(
    'Folio: insert OK + folio sin red → quedan sin_folio, no pendientes',
    r.cortadoPorRed && srv.filas.size === 2 && intermedio.every((m) => m.estadoEnvio === 'sin_folio'),
    `estados=${intermedio.map((m) => m.estadoEnvio)}`,
  );

  srv.folioConRedCaida = false;
  const insertsAntes = srv.llamadasInsertar;
  const r2 = await procesarCola(cola, srv, USUARIO);
  caso(
    'Folio: el reintento no reenvía el insert y numera el despacho una vez',
    srv.llamadasInsertar === insertsAntes &&
      r2.folios === 1 &&
      srv.folios.get(e1.uuidLocal) === srv.folios.get(e2.uuidLocal) &&
      (await cola.listar()).length === 0,
    `inserts extra=${srv.llamadasInsertar - insertsAntes} folio=${srv.folios.get(e1.uuidLocal)}`,
  );
}

{
  // Un despacho con un miembro todavía pendiente no pide folio. Estado
  // intermedio forzado: `a` ya llegó (sin_folio) y `b`, del mismo despacho, no
  // puede subir porque se cayó la red.
  const cola2 = crearColaMemoria();
  const srv2 = crearServidorFalso();
  const a = mov('entrega', 'c1', 0, { despachoId: 'd-z' });
  const b = mov('entrega', 'c2', 1, { despachoId: 'd-z' });
  await cola2.encolar(a);
  await cola2.encolar(b);
  await srv2.insertar([a]);
  await cola2.marcarSinFolio([a.uuidLocal]);
  srv2.redCaida = true; // b no puede subir
  await procesarCola(cola2, srv2, USUARIO);
  caso(
    'Folio: no se pide mientras un movimiento del despacho siga pendiente',
    srv2.llamadasFolio === 0 && (await cola2.listar()).length === 2,
    `llamadas folio=${srv2.llamadasFolio}`,
  );
}

{
  // Pendientes de otro usuario no se envían con esta sesión.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  await cola.encolar(mov('carga', 'c1', 0, { usuarioId: 'otro' }));
  await procesarCola(cola, srv, USUARIO);
  caso(
    'Sync: solo se envían los movimientos del usuario de la sesión',
    srv.llamadasInsertar === 0 && (await cola.listar()).length === 1,
  );
}

/* ------------------------------------------- 3. un folio por visita */

/** Escanea con señal: encola y corre un ciclo, como `registrar` en la app. */
async function escanearConSenal(cola, srv, m) {
  await cola.encolar(m);
  await procesarCola(cola, srv, USUARIO);
}

const mismoConjunto = (a, b) => a.length === b.length && a.every((u) => b.includes(u));

{
  // El error de main: con señal, cada cilindro subía y pedía su folio solo.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  await cola.abrirDespacho({ despachoId: 'v1', usuarioId: USUARIO, sucursalId: SUC_A });
  const visita = ['c1', 'c2', 'c3'].map((c, i) => mov('entrega', c, i, { despachoId: 'v1' }));
  for (const m of visita) await escanearConSenal(cola, srv, m);
  const mientras = await cola.listar();
  const conteo = await cola.contar();
  caso(
    'Visita: con señal y la visita abierta, los 3 cilindros suben pero no piden folio',
    srv.filas.size === 3 &&
      srv.llamadasFolio === 0 &&
      mientras.every((m) => m.estadoEnvio === 'sin_folio') &&
      conteo.pendientes === 0,
    `filas=${srv.filas.size} llamadasFolio=${srv.llamadasFolio} pendientes=${conteo.pendientes}`,
  );

  await cola.cerrarDespacho('v1');
  const r = await procesarCola(cola, srv, USUARIO);
  const uuids = visita.map((m) => m.uuidLocal);
  const folios = new Set(uuids.map((u) => srv.folios.get(u)));
  caso(
    'Visita: al cerrarla, 1 llamada a asignar_folio_despacho con los 3 uuid_local y 1 folio',
    r.folios === 1 &&
      srv.llamadasFolio === 1 &&
      mismoConjunto(srv.gruposFolio[0], uuids) &&
      folios.size === 1 &&
      !folios.has(undefined),
    `llamadas=${srv.llamadasFolio} grupo=${srv.gruposFolio[0]?.length} folios=${[...folios]}`,
  );
  caso(
    'Visita: terminada, no queda nada en la cola ni la visita',
    (await cola.listar()).length === 0 && (await cola.listarDespachos()).length === 0,
  );
}

{
  // Filas sin registro de visita (de antes del arreglo): piden folio como antes.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  const antiguas = ['c1', 'c2'].map((c, i) => mov('entrega', c, i, { despachoId: 'sin-registro' }));
  for (const m of antiguas) await cola.encolar(m);
  const r = await procesarCola(cola, srv, USUARIO);
  caso(
    'Visita: un despacho sin registro local (cola antigua) pide su folio igual',
    r.folios === 1 && (await cola.listar()).length === 0,
    `folios=${r.folios}`,
  );
}

{
  // Dos visitas distintas: folios distintos y consecutivos.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  for (const [id, sucursal, cilindros] of [
    ['va', SUC_A, ['c1', 'c2']],
    ['vb', 'sucursal-b', ['c3']],
  ]) {
    await cola.abrirDespacho({ despachoId: id, usuarioId: USUARIO, sucursalId: sucursal });
    for (const [i, c] of cilindros.entries()) {
      await escanearConSenal(cola, srv, mov('entrega', c, i, { despachoId: id, sucursalId: sucursal }));
    }
    await cola.cerrarDespacho(id);
  }
  await procesarCola(cola, srv, USUARIO);
  const porVisita = srv.gruposFolio.map((g) => srv.folios.get(g[0]));
  caso(
    'Visita: dos visitas reciben folios distintos y consecutivos',
    srv.llamadasFolio === 2 && porVisita[1] === porVisita[0] + 1,
    `folios=${porVisita}`,
  );
}

{
  // Cerrada sin red para el folio: el reintento no reenvía ni numera dos veces.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  await cola.abrirDespacho({ despachoId: 'vr', usuarioId: USUARIO, sucursalId: SUC_A });
  const visita = ['c1', 'c2', 'c3'].map((c, i) => mov('retiro', c, i, { despachoId: 'vr' }));
  for (const m of visita) await escanearConSenal(cola, srv, m);
  await cola.cerrarDespacho('vr');
  srv.folioConRedCaida = true;
  const r = await procesarCola(cola, srv, USUARIO);
  const intermedio = await cola.listar();
  srv.folioConRedCaida = false;
  const insertsAntes = srv.llamadasInsertar;
  await procesarCola(cola, srv, USUARIO);
  await procesarCola(cola, srv, USUARIO);
  const folios = new Set(visita.map((m) => srv.folios.get(m.uuidLocal)));
  caso(
    'Visita: folio sin red al cerrar → reintento sin reenviar, 1 folio para los 3',
    r.cortadoPorRed &&
      intermedio.length === 3 &&
      (await cola.listarDespachos()).length === 0 &&
      srv.llamadasInsertar === insertsAntes &&
      folios.size === 1 &&
      srv.gruposFolio.every((g) => mismoConjunto(g, visita.map((m) => m.uuidLocal))),
    `llamadasFolio=${srv.llamadasFolio} folios=${[...folios]}`,
  );
}

{
  // La app se cerró con la visita abierta: al volver se cierra sola. La del
  // otro usuario del teléfono no se toca.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  await cola.abrirDespacho({ despachoId: 'vp', usuarioId: USUARIO, sucursalId: SUC_A });
  await cola.abrirDespacho({ despachoId: 'vo', usuarioId: 'otro', sucursalId: SUC_A });
  for (const [i, c] of ['c1', 'c2'].entries()) {
    await escanearConSenal(cola, srv, mov('entrega', c, i, { despachoId: 'vp' }));
  }
  await cola.cerrarDespachosAbiertos(USUARIO);
  const r = await procesarCola(cola, srv, USUARIO);
  const visitas = await cola.listarDespachos();
  caso(
    'Visita: abierta al reiniciar la app → se cierra sola y recibe 1 folio',
    r.folios === 1 &&
      visitas.length === 1 &&
      visitas[0].despachoId === 'vo' &&
      visitas[0].estado === 'abierto',
    `folios=${r.folios} visitas=${JSON.stringify(visitas.map((v) => [v.despachoId, v.estado]))}`,
  );
}

{
  // Sin señal toda la visita: al volver, 1 lote y 1 folio.
  const cola = crearColaMemoria();
  const srv = crearServidorFalso();
  srv.redCaida = true;
  await cola.abrirDespacho({ despachoId: 'vs', usuarioId: USUARIO, sucursalId: SUC_A });
  const visita = ['c1', 'c2', 'c3'].map((c, i) => mov('entrega', c, i, { despachoId: 'vs' }));
  for (const m of visita) await escanearConSenal(cola, srv, m);
  await cola.cerrarDespacho('vs');
  srv.redCaida = false;
  srv.llamadasInsertar = 0;
  const r = await procesarCola(cola, srv, USUARIO);
  caso(
    'Visita: hecha sin señal → al volver, 1 lote y 1 folio con los 3',
    srv.llamadasInsertar === 1 &&
      r.folios === 1 &&
      srv.llamadasFolio === 1 &&
      mismoConjunto(srv.gruposFolio[0], visita.map((m) => m.uuidLocal)),
    `inserts=${srv.llamadasInsertar} llamadasFolio=${srv.llamadasFolio}`,
  );
}

/* ------------------------------------------------------------- resultado */

console.log('\n== Prueba local de sincronización ==\n');
for (const r of resultados) {
  console.log(`${r.resultado} · ${r.nombre}${r.detalle ? `\n       ${r.detalle}` : ''}`);
}
const fallas = resultados.filter((r) => r.resultado === 'FALLA').length;
console.log(`\n${resultados.length - fallas}/${resultados.length} PASA`);
process.exit(fallas === 0 ? 0 : 1);
