/**
 * Contrato de la cola de pendientes y su implementación en memoria.
 *
 * Vive aparte de `colaLocal.ts` porque ese módulo importa `expo-sqlite`, que no
 * existe en web: si el contrato viviera ahí, el bundle de web arrastraría SQLite
 * (y su `.wasm`) sólo para leer un tipo. Acá no hay ninguna dependencia nativa,
 * así que lo puede importar cualquier plataforma (y Node, en las pruebas).
 *
 * La implementación en memoria es la que usa web (`colaLocal.web.ts`) y sirve
 * también para pruebas. No sobrevive a un reinicio: en el teléfono, que es donde
 * importa, la cola real es la de SQLite.
 *
 * CICLO DE VIDA DE UN MOVIMIENTO EN LA COLA (`estadoEnvio`):
 *  - `pendiente`: registrado en el teléfono, todavía no llegó al servidor.
 *  - `sin_folio`: el insert funcionó, falta pedir el folio del despacho. No se
 *    vuelve a enviar; solo se reintenta `asignar_folio_despacho`. Si el servidor
 *    rechaza el folio, queda acá con `errorEnvio` y no se reintenta solo.
 *  - `rechazado`: el servidor lo rechazó por datos o permisos (constraint, RLS).
 *    Queda visible con su error en vez de borrarse, y no bloquea al resto.
 * Cuando el movimiento ya está en el servidor y no necesita folio (o ya lo
 * tiene), se quita de la cola: desde ahí la verdad es el servidor.
 *
 * VISITAS (`DespachoLocal`). Una visita es la entrega o retiro en una sucursal
 * desde que se escanea el primer cilindro hasta que el técnico sale de la
 * pantalla (con "Finalizar", con el botón atrás o cambiando de sucursal).
 * Mientras está ABIERTA no se pide folio: con señal, cada cilindro sube apenas se
 * escanea, y pedir el folio en ese momento numeraría cada cilindro por separado.
 * Al cerrarse se pide un solo folio para toda la visita. Si la app se cierra con
 * una visita abierta, se cierra sola al volver a abrirla
 * (`cerrarDespachosAbiertos`). Un despacho sin registro de visita (filas de antes
 * de este cambio) cuenta como cerrado: pide folio como siempre.
 */

import type { MovimientoNuevo, Uuid } from '../dominio/tipos';

export type EstadoEnvio = 'pendiente' | 'sin_folio' | 'rechazado';

export interface MovimientoEnCola extends MovimientoNuevo {
  estadoEnvio: EstadoEnvio;
  errorEnvio: string | null;
}

export type EstadoDespacho = 'abierto' | 'cerrado';

export interface DespachoLocal {
  despachoId: Uuid;
  usuarioId: Uuid;
  sucursalId: Uuid;
  estado: EstadoDespacho;
}

export type DespachoNuevo = Pick<DespachoLocal, 'despachoId' | 'usuarioId' | 'sucursalId'>;

export interface ConteoCola {
  /** Falta enviarlos o falta su folio, y se van a reintentar solos. */
  pendientes: number;
  /** Rechazados por el servidor (insert o folio): necesitan revisión. */
  conError: number;
}

export interface ColaLocal {
  /** Idempotente por `uuidLocal`. */
  encolar(movimiento: MovimientoNuevo): Promise<void>;
  /** Todo lo que hay en la cola, ordenado por `fechaEvento`. */
  listar(): Promise<MovimientoEnCola[]>;
  contar(): Promise<ConteoCola>;
  /** El insert funcionó: ya no se reenvían, falta el folio. */
  marcarSinFolio(uuidsLocales: Uuid[]): Promise<void>;
  marcarRechazados(uuidsLocales: Uuid[], error: string): Promise<void>;
  /** El folio fue rechazado: siguen en `sin_folio` pero con error, sin reintento automático. */
  anotarErrorFolio(uuidsLocales: Uuid[], error: string): Promise<void>;
  /** Ya están completos en el servidor. */
  quitar(uuidsLocales: Uuid[]): Promise<void>;

  /** Idempotente por `despachoId`. */
  abrirDespacho(despacho: DespachoNuevo): Promise<void>;
  /** Solo cierra si sigue abierto. */
  cerrarDespacho(despachoId: Uuid): Promise<void>;
  /** Cierra las visitas abiertas del usuario (la app se cerró sin salir de la pantalla). */
  cerrarDespachosAbiertos(usuarioId: Uuid): Promise<void>;
  listarDespachos(): Promise<DespachoLocal[]>;
  quitarDespacho(despachoId: Uuid): Promise<void>;
}

export function contarCola(items: MovimientoEnCola[], despachos: DespachoLocal[] = []): ConteoCola {
  const abiertos = new Set(despachos.filter((d) => d.estado === 'abierto').map((d) => d.despachoId));
  let pendientes = 0;
  let conError = 0;
  for (const m of items) {
    if (m.estadoEnvio === 'rechazado' || m.errorEnvio !== null) conError += 1;
    // Ya llegó y espera que se cierre la visita para pedir folio: no está atrasado.
    else if (m.estadoEnvio === 'sin_folio' && m.despachoId !== null && abiertos.has(m.despachoId)) continue;
    else pendientes += 1;
  }
  return { pendientes, conError };
}

export function ordenarPorFecha<T extends { fechaEvento: string; uuidLocal: string }>(items: T[]): T[] {
  return items.slice().sort(
    (a, b) =>
      new Date(a.fechaEvento).getTime() - new Date(b.fechaEvento).getTime() ||
      a.uuidLocal.localeCompare(b.uuidLocal),
  );
}

/** Cola en memoria: sólo para web y para pruebas. */
export function crearColaMemoria(): ColaLocal {
  const items = new Map<string, MovimientoEnCola>();
  const despachos = new Map<string, DespachoLocal>();

  function actualizar(uuids: Uuid[], cambio: Partial<MovimientoEnCola>) {
    for (const u of uuids) {
      const m = items.get(u);
      if (m) items.set(u, { ...m, ...cambio });
    }
  }

  return {
    async encolar(m) {
      if (!items.has(m.uuidLocal)) {
        items.set(m.uuidLocal, { ...m, estadoEnvio: 'pendiente', errorEnvio: null });
      }
    },
    async listar() {
      return ordenarPorFecha(Array.from(items.values()));
    },
    async contar() {
      return contarCola(Array.from(items.values()), Array.from(despachos.values()));
    },
    async marcarSinFolio(uuids) {
      actualizar(uuids, { estadoEnvio: 'sin_folio', errorEnvio: null });
    },
    async marcarRechazados(uuids, error) {
      actualizar(uuids, { estadoEnvio: 'rechazado', errorEnvio: error });
    },
    async anotarErrorFolio(uuids, error) {
      actualizar(uuids, { errorEnvio: error });
    },
    async quitar(uuids) {
      uuids.forEach((u) => items.delete(u));
    },
    async abrirDespacho(d) {
      if (!despachos.has(d.despachoId)) despachos.set(d.despachoId, { ...d, estado: 'abierto' });
    },
    async cerrarDespacho(id) {
      const d = despachos.get(id);
      if (d?.estado === 'abierto') despachos.set(id, { ...d, estado: 'cerrado' });
    },
    async cerrarDespachosAbiertos(usuarioId) {
      for (const d of despachos.values()) {
        if (d.usuarioId === usuarioId && d.estado === 'abierto') {
          despachos.set(d.despachoId, { ...d, estado: 'cerrado' });
        }
      }
    },
    async listarDespachos() {
      return Array.from(despachos.values());
    },
    async quitarDespacho(id) {
      despachos.delete(id);
    },
  };
}
