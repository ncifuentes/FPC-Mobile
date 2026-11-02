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
 *
 * El ciclo de vida de cada fila (`estado_envio`) está descrito en `colaMemoria.ts`.
 */

import * as SQLite from 'expo-sqlite';

import { contarCola, type ColaLocal, type EstadoEnvio, type MovimientoEnCola } from './colaMemoria';

export type { ColaLocal };

const NOMBRE_BD = 'fpc-mobile.db';

const DDL = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS movimientos_pendientes (
  uuid_local    TEXT PRIMARY KEY NOT NULL,
  tipo          TEXT NOT NULL,
  cilindro_id   TEXT NOT NULL,
  sucursal_id   TEXT,
  usuario_id    TEXT NOT NULL,
  camion_id     TEXT NOT NULL,
  fecha_evento  TEXT NOT NULL,
  origen_codigo TEXT NOT NULL
);
`;

/**
 * Columnas agregadas después de la primera versión de la tabla. Una instalación
 * existente ya tiene la tabla creada sin ellas y `CREATE TABLE IF NOT EXISTS` no
 * la toca: se agregan con `ALTER TABLE` solo si faltan (SQLite no tiene
 * `ADD COLUMN IF NOT EXISTS`). Las filas antiguas quedan `pendiente`, sin
 * despacho (no piden folio) y sin textos de despliegue.
 */
const COLUMNAS_NUEVAS: [nombre: string, definicion: string][] = [
  ['despacho_id', 'TEXT'],
  ['estado_envio', "TEXT NOT NULL DEFAULT 'pendiente'"],
  ['error_envio', 'TEXT'],
  ['codigo_cilindro', 'TEXT'],
  ['nombre_cliente', 'TEXT'],
  ['nombre_sucursal', 'TEXT'],
];

type FilaCola = {
  uuid_local: string;
  tipo: string;
  cilindro_id: string;
  sucursal_id: string | null;
  usuario_id: string;
  camion_id: string;
  fecha_evento: string;
  origen_codigo: string;
  despacho_id: string | null;
  estado_envio: string;
  error_envio: string | null;
  codigo_cilindro: string | null;
  nombre_cliente: string | null;
  nombre_sucursal: string | null;
};

function aMovimiento(f: FilaCola): MovimientoEnCola {
  return {
    uuidLocal: f.uuid_local,
    tipo: f.tipo as MovimientoEnCola['tipo'],
    cilindroId: f.cilindro_id,
    sucursalId: f.sucursal_id,
    usuarioId: f.usuario_id,
    camionId: f.camion_id,
    fechaEvento: f.fecha_evento,
    fechaSync: null,
    origenCodigo: f.origen_codigo as MovimientoEnCola['origenCodigo'],
    despachoId: f.despacho_id,
    codigoCilindro: f.codigo_cilindro ?? '—',
    nombreCliente: f.nombre_cliente,
    nombreSucursal: f.nombre_sucursal,
    estadoEnvio: f.estado_envio as EstadoEnvio,
    errorEnvio: f.error_envio,
  };
}

async function migrar(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(DDL);
  const existentes = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(movimientos_pendientes)',
  );
  const nombres = new Set(existentes.map((c) => c.name));
  for (const [nombre, definicion] of COLUMNAS_NUEVAS) {
    if (!nombres.has(nombre)) {
      await db.execAsync(`ALTER TABLE movimientos_pendientes ADD COLUMN ${nombre} ${definicion}`);
    }
  }
}

function crearColaSqlite(): ColaLocal {
  let bd: Promise<SQLite.SQLiteDatabase> | null = null;

  // Se guarda la promesa y no la conexión: dos llamadas simultáneas al abrir
  // la app (contador + proyección) no deben correr la migración dos veces.
  function conexion(): Promise<SQLite.SQLiteDatabase> {
    if (!bd) {
      bd = SQLite.openDatabaseAsync(NOMBRE_BD).then(async (db) => {
        await migrar(db);
        return db;
      });
      bd.catch(() => {
        bd = null;
      });
    }
    return bd;
  }

  async function actualizar(uuids: string[], asignaciones: string, valores: (string | null)[]) {
    if (uuids.length === 0) return;
    const db = await conexion();
    const marcas = uuids.map(() => '?').join(', ');
    await db.runAsync(
      `UPDATE movimientos_pendientes SET ${asignaciones} WHERE uuid_local IN (${marcas})`,
      ...valores,
      ...uuids,
    );
  }

  async function listar(): Promise<MovimientoEnCola[]> {
    const db = await conexion();
    const filas = await db.getAllAsync<FilaCola>(
      'SELECT * FROM movimientos_pendientes ORDER BY fecha_evento ASC, uuid_local ASC',
    );
    return filas.map(aMovimiento);
  }

  return {
    async encolar(m) {
      const db = await conexion();
      // OR IGNORE = misma idempotencia que `on conflict do nothing` en Postgres.
      await db.runAsync(
        `INSERT OR IGNORE INTO movimientos_pendientes
           (uuid_local, tipo, cilindro_id, sucursal_id, usuario_id, camion_id, fecha_evento,
            origen_codigo, despacho_id, estado_envio, codigo_cilindro, nombre_cliente, nombre_sucursal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
        m.uuidLocal,
        m.tipo,
        m.cilindroId,
        m.sucursalId,
        m.usuarioId,
        m.camionId,
        m.fechaEvento,
        m.origenCodigo,
        m.despachoId,
        m.codigoCilindro,
        m.nombreCliente,
        m.nombreSucursal,
      );
    },
    listar,
    async contar() {
      return contarCola(await listar());
    },
    async marcarSinFolio(uuids) {
      await actualizar(uuids, "estado_envio = 'sin_folio', error_envio = NULL", []);
    },
    async marcarRechazados(uuids, error) {
      await actualizar(uuids, "estado_envio = 'rechazado', error_envio = ?", [error]);
    },
    async anotarErrorFolio(uuids, error) {
      await actualizar(uuids, 'error_envio = ?', [error]);
    },
    async quitar(uuids) {
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
