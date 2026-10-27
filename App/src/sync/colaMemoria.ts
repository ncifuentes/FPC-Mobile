/**
 * Contrato de la cola de pendientes y su implementación en memoria.
 *
 * Vive aparte de `colaLocal.ts` porque ese módulo importa `expo-sqlite`, que no
 * existe en web: si el contrato viviera ahí, el bundle de web arrastraría SQLite
 * (y su `.wasm`) sólo para leer un tipo. Acá no hay ninguna dependencia nativa,
 * así que lo puede importar cualquier plataforma.
 *
 * La implementación en memoria es la que usa web (`colaLocal.web.ts`) y sirve
 * también para pruebas. No sobrevive a un reinicio: en el teléfono, que es donde
 * importa, la cola real es la de SQLite.
 */

import type { Movimiento } from '../dominio/tipos';

export interface ColaLocal {
  encolar(movimiento: Movimiento): Promise<void>;
  pendientes(): Promise<Movimiento[]>;
  contar(): Promise<number>;
  confirmarEnviados(uuidsLocales: string[]): Promise<void>;
}

/** Cola en memoria: sólo para web y para pruebas. */
export function crearColaMemoria(): ColaLocal {
  const items = new Map<string, Movimiento>();
  return {
    async encolar(m) {
      if (!items.has(m.uuidLocal)) items.set(m.uuidLocal, m);
    },
    async pendientes() {
      return Array.from(items.values());
    },
    async contar() {
      return items.size;
    },
    async confirmarEnviados(uuids) {
      uuids.forEach((u) => items.delete(u));
    },
  };
}
