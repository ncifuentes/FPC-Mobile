/**
 * Contratos de acceso a datos.
 *
 * Las pantallas sólo conocen estas interfaces. Hoy la implementación es en
 * memoria (`src/datos/repositorioMemoria.ts`); cuando la base esté migrada se
 * escribe `repositorioSupabase.ts` cumpliendo el mismo contrato y se cambia una
 * sola línea en `src/datos/index.ts`. Ninguna pantalla se reescribe.
 */

import type {
  Camion,
  Cilindro,
  Cliente,
  Movimiento,
  MovimientoDetallado,
  Usuario,
  Uuid,
} from './tipos';

export interface RepositorioAutenticacion {
  iniciarSesion(usuario: string, clave: string): Promise<Usuario>;
  cerrarSesion(): Promise<void>;
  sesionActual(): Promise<Usuario | null>;
}

export interface RepositorioClientes {
  /** Catálogo completo. Con 120 clientes activos la descarga de jornada es menor. */
  listar(): Promise<Cliente[]>;
  buscar(texto: string): Promise<Cliente[]>;
  obtener(id: Uuid): Promise<Cliente | null>;
}

export interface RepositorioCilindros {
  obtenerPorCodigo(codigo: string): Promise<Cilindro | null>;
  listarPorEstado(estado: Cilindro['estado']): Promise<Cilindro[]>;
  /** Cilindros cargados hoy en un vehículo: es el universo entregable. */
  listarEnCamion(camionId: Uuid): Promise<Cilindro[]>;
  buscar(texto: string): Promise<Cilindro[]>;
}

export interface RepositorioCamiones {
  listar(): Promise<Camion[]>;
  obtener(id: Uuid): Promise<Camion | null>;
}

export interface RepositorioMovimientos {
  /**
   * Registra el movimiento localmente y lo deja en la cola de sincronización.
   * Nace con `uuidLocal` y `fechaEvento`; `fechaSync` la pone el servidor.
   */
  registrar(movimiento: Movimiento): Promise<void>;
  /** Movimientos del día para el listado "Registros del día". */
  listarDelDia(camionId: Uuid, fecha: Date): Promise<MovimientoDetallado[]>;
  /** Historial completo de un cilindro. */
  listarPorCilindro(cilindroId: Uuid): Promise<MovimientoDetallado[]>;
  /** Movimientos aún no enviados al servidor. */
  listarPendientes(): Promise<Movimiento[]>;
  /** Marca como sincronizados los movimientos cuyo uuidLocal se indique. */
  marcarSincronizados(uuidsLocales: Uuid[], fechaSync: string): Promise<void>;
}

export interface Repositorios {
  auth: RepositorioAutenticacion;
  clientes: RepositorioClientes;
  cilindros: RepositorioCilindros;
  camiones: RepositorioCamiones;
  movimientos: RepositorioMovimientos;
}

/** Error de negocio esperable, con mensaje apto para mostrar al técnico. */
export class ErrorDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}
