/**
 * Cola local de movimientos pendientes de envío (iOS y Android).
 *
 * Es la pieza que hace posible el reparto interregional: el técnico registra sin
 * señal y la jornada se envía cuando vuelve la conexión. Regla de la arquitectura:
 * cada movimiento nace en el teléfono con `uuidLocal` y se envía por lotes con
 * `on conflict (uuidLocal) do nothing`, así reintentar nunca duplica.
 *
 * Se usa SQLite y no el almacenamiento del navegador porque el navegador puede
 * vaciar su almacén sin avisar; un contenedor nativo con SQLite no.
 *
 * En web Metro resuelve `colaLocal.web.ts` en vez de este archivo, y ahí la cola
 * es en memoria. Por eso acá se importa `expo-sqlite` sin condicionales: este
 * módulo no llega nunca al bundle del navegador.
 */

import * as SQLite from 'expo-sqlite';

import type { Movimiento } from '../dominio/tipos';
import type { ColaLocal } from './colaMemoria';

export type { ColaLocal };

const NOMBRE_BD = 'fpc-mobile.db';

const DDL = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS movimientos_pendientes (
  uuid_local    TEXT PRIMARY KEY NOT NULL,
  tipo          TEXT NOT NULL,
  cilindro_id   TEXT NOT NULL,
  cliente_id    TEXT,
  usuario_id    TEXT NOT NULL,
  camion_id     TEXT NOT NULL,
  fecha_evento  TEXT NOT NULL,
  origen_codigo TEXT NOT NULL
);
`;

type FilaPendiente = {
  uuid_local: string;
  tipo: string;
  cilindro_id: string;
  cliente_id: string | null;
  usuario_id: string;
  camion_id: string;
  fecha_evento: string;
  origen_codigo: string;
};

function aMovimiento(f: FilaPendiente): Movimiento {
  return {
    uuidLocal: f.uuid_local,
    tipo: f.tipo as Movimiento['tipo'],
    cilindroId: f.cilindro_id,
    clienteId: f.cliente_id,
    usuarioId: f.usuario_id,
    camionId: f.camion_id,
    fechaEvento: f.fecha_evento,
    fechaSync: null,
    origenCodigo: f.origen_codigo as Movimiento['origenCodigo'],
  };
}

function crearColaSqlite(): ColaLocal {
  let bd: SQLite.SQLiteDatabase | null = null;

  async function conexion(): Promise<SQLite.SQLiteDatabase> {
    if (!bd) {
      bd = await SQLite.openDatabaseAsync(NOMBRE_BD);
      await bd.execAsync(DDL);
    }
    return bd;
  }

  return {
    async encolar(m) {
      const db = await conexion();
      // OR IGNORE = misma idempotencia que `on conflict do nothing` en Postgres.
      await db.runAsync(
        `INSERT OR IGNORE INTO movimientos_pendientes
           (uuid_local, tipo, cilindro_id, cliente_id, usuario_id, camion_id, fecha_evento, origen_codigo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        m.uuidLocal,
        m.tipo,
        m.cilindroId,
        m.clienteId,
        m.usuarioId,
        m.camionId,
        m.fechaEvento,
        m.origenCodigo,
      );
    },
    async pendientes() {
      const db = await conexion();
      const filas = await db.getAllAsync<FilaPendiente>(
        'SELECT * FROM movimientos_pendientes ORDER BY fecha_evento ASC',
      );
      return filas.map(aMovimiento);
    },
    async contar() {
      const db = await conexion();
      const fila = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM movimientos_pendientes',
      );
      return fila?.n ?? 0;
    },
    async confirmarEnviados(uuids) {
      if (uuids.length === 0) return;
      const db = await conexion();
      const marcas = uuids.map(() => '?').join(', ');
      await db.runAsync(
        `DELETE FROM movimientos_pendientes WHERE uuid_local IN (${marcas})`,
        ...uuids,
      );
    },
  };
}

export const colaLocal: ColaLocal = crearColaSqlite();
