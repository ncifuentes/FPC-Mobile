/**
 * Un ciclo de sincronización: enviar lo pendiente y pedir los folios.
 *
 * No conoce Supabase ni React Native: recibe la cola y un `ServidorMovimientos`
 * (en la app, el adaptador de `sincronizador.tsx`; en las pruebas, uno falso o
 * un cliente real autenticado). Así la lógica se prueba en Node sin teléfono.
 *
 * ENVÍO. Lotes de hasta `TAM_LOTE` con `upsert ... ignoreDuplicates` (en SQL:
 * `on conflict (uuid_local) do nothing`), así reenviar algo que ya llegó no
 * duplica. Si el lote falla:
 *  - por red (o 401/5xx): se corta el ciclo y la cola queda como estaba;
 *  - por datos o RLS: se parte el lote en mitades hasta aislar los movimientos
 *    rechazados, que quedan `rechazado` con el mensaje del servidor. El resto
 *    entra normalmente: un movimiento malo no bloquea la jornada.
 *
 * FOLIO. Tras el insert, cada movimiento con despacho queda `sin_folio` y se
 * pide UN folio por despacho con todos sus `uuid_local`. Las cargas (y las filas
 * antiguas sin despacho) se quitan de la cola apenas llegan:
 * `asignar_folio_despacho` rechaza cargas, que no tienen sucursal. Si el insert
 * funcionó pero el folio falló por red, el movimiento NO se reenvía: queda
 * `sin_folio` y en el ciclo siguiente solo se reintenta el folio. La función es
 * idempotente, así que reintentar no consume otro número.
 *
 * Un despacho no pide folio mientras alguno de sus movimientos siga
 * `pendiente`: la función exige que todos estén en el servidor y, si se numerara
 * una parte, el resto quedaría fuera de la llamada (ya se habría quitado de la
 * cola la parte numerada). Tampoco mientras la visita siga ABIERTA (el técnico
 * sigue en la pantalla de entrega o retiro): con señal cada cilindro sube apenas
 * se escanea, y pedir folio en ese momento numeraría cada cilindro por separado.
 * Los despachos sin registro de visita (filas de antes de este cambio) piden
 * folio como siempre. Una visita cerrada se borra cuando ya no le queda ningún
 * movimiento por enviar o por numerar.
 */

import type { ErrorServidor } from '../datos/red';
import { esRechazoDefinitivo } from '../datos/red';
import type { Movimiento, Uuid } from '../dominio/tipos';
import type { ColaLocal, MovimientoEnCola } from './colaMemoria';

export const TAM_LOTE = 50;

export interface ServidorMovimientos {
  /** Inserta con `on conflict (uuid_local) do nothing`. null si funcionó. */
  insertar(lote: Movimiento[]): Promise<ErrorServidor | null>;
  /** `asignar_folio_despacho(p_uuids)`. null si funcionó. */
  asignarFolio(uuids: Uuid[]): Promise<ErrorServidor | null>;
}

export interface ResultadoCiclo {
  insertados: MovimientoEnCola[];
  rechazados: number;
  folios: number;
  /** El ciclo se cortó por falta de red: quedó trabajo para el próximo. */
  cortadoPorRed: boolean;
}

function partes<T>(items: T[], tam: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += tam) salida.push(items.slice(i, i + tam));
  return salida;
}

/**
 * @param usuarioId Solo se envía lo registrado por el usuario de la sesión. Si
 *   otro técnico usó el teléfono y dejó pendientes, RLS los rechazaría con esta
 *   sesión: esperan a que él vuelva a entrar.
 */
export async function procesarCola(
  cola: ColaLocal,
  servidor: ServidorMovimientos,
  usuarioId: Uuid,
): Promise<ResultadoCiclo> {
  const resultado: ResultadoCiclo = { insertados: [], rechazados: 0, folios: 0, cortadoPorRed: false };

  const propios = (await cola.listar()).filter((m) => m.usuarioId === usuarioId);
  const pendientes = propios.filter((m) => m.estadoEnvio === 'pendiente');

  async function confirmarInsertados(lote: MovimientoEnCola[]) {
    const conFolio = lote.filter((m) => m.tipo !== 'carga' && m.despachoId !== null);
    const sinFolio = lote.filter((m) => !conFolio.includes(m));
    await cola.marcarSinFolio(conFolio.map((m) => m.uuidLocal));
    await cola.quitar(sinFolio.map((m) => m.uuidLocal));
    resultado.insertados.push(...lote);
  }

  /** Devuelve false si se cortó por red. */
  async function enviarAislando(lote: MovimientoEnCola[]): Promise<boolean> {
    const error = await servidor.insertar(lote);
    if (!error) {
      await confirmarInsertados(lote);
      return true;
    }
    if (!esRechazoDefinitivo(error)) return false;
    if (lote.length === 1) {
      await cola.marcarRechazados([lote[0].uuidLocal], error.message);
      resultado.rechazados += 1;
      return true;
    }
    const mitad = Math.ceil(lote.length / 2);
    if (!(await enviarAislando(lote.slice(0, mitad)))) return false;
    return enviarAislando(lote.slice(mitad));
  }

  for (const lote of partes(pendientes, TAM_LOTE)) {
    if (!(await enviarAislando(lote))) {
      resultado.cortadoPorRed = true;
      return resultado;
    }
  }

  // Folios: se relee la cola porque el envío acaba de cambiar estados.
  const actual = (await cola.listar()).filter((m) => m.usuarioId === usuarioId);
  const abiertos = new Set(
    (await cola.listarDespachos())
      .filter((d) => d.usuarioId === usuarioId && d.estado === 'abierto')
      .map((d) => d.despachoId),
  );
  const despachosConPendientes = new Set(
    actual.filter((m) => m.estadoEnvio === 'pendiente').map((m) => m.despachoId),
  );
  const porDespacho = new Map<Uuid, Uuid[]>();
  for (const m of actual) {
    if (m.estadoEnvio !== 'sin_folio' || m.errorEnvio !== null || m.despachoId === null) continue;
    if (despachosConPendientes.has(m.despachoId) || abiertos.has(m.despachoId)) continue;
    const grupo = porDespacho.get(m.despachoId) ?? [];
    grupo.push(m.uuidLocal);
    porDespacho.set(m.despachoId, grupo);
  }

  for (const uuids of porDespacho.values()) {
    const error = await servidor.asignarFolio(uuids);
    if (!error) {
      await cola.quitar(uuids);
      resultado.folios += 1;
    } else if (esRechazoDefinitivo(error)) {
      await cola.anotarErrorFolio(uuids, error.message);
    } else {
      resultado.cortadoPorRed = true;
      return resultado;
    }
  }

  await quitarVisitasTerminadas(cola, usuarioId);
  return resultado;
}

/**
 * Borra las visitas cerradas que ya no tienen movimientos por enviar o por
 * numerar. Las filas con error que queden en la cola siguen visibles; sin
 * registro de visita cuentan como cerradas, que es lo que son.
 */
async function quitarVisitasTerminadas(cola: ColaLocal, usuarioId: Uuid): Promise<void> {
  const enCamino = new Set(
    (await cola.listar())
      .filter(
        (m) =>
          m.usuarioId === usuarioId &&
          (m.estadoEnvio === 'pendiente' || (m.estadoEnvio === 'sin_folio' && m.errorEnvio === null)),
      )
      .map((m) => m.despachoId),
  );
  for (const d of await cola.listarDespachos()) {
    if (d.usuarioId !== usuarioId || d.estado !== 'cerrado' || enCamino.has(d.despachoId)) continue;
    await cola.quitarDespacho(d.despachoId);
  }
}

/**
 * Fila para `public.movimientos`: solo columnas reales, sin datos de despliegue
 * ni de la cola. `fecha_sync` NO se envía: la sella el servidor con un trigger.
 */
export function columnasMovimiento(m: Movimiento) {
  return {
    uuid_local: m.uuidLocal,
    tipo: m.tipo,
    cilindro_id: m.cilindroId,
    sucursal_id: m.sucursalId,
    usuario_id: m.usuarioId,
    camion_id: m.camionId,
    fecha_evento: m.fechaEvento,
    codigo_origen: m.origenCodigo,
  };
}
