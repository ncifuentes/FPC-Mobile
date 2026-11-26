/**
 * Contratos de acceso a datos.
 *
 * Las pantallas sólo conocen estas interfaces. La implementación vive en
 * `src/datos/` (Supabase, respaldo de catálogo y cola local) y se cablea en
 * `src/datos/index.ts`.
 */

import type {
  Camion,
  Cilindro,
  Cliente,
  HistorialMovimientos,
  Movimiento,
  MovimientoNuevo,
  Sucursal,
  Usuario,
  Uuid,
} from './tipos';

export interface RepositorioAutenticacion {
  iniciarSesion(usuario: string, clave: string): Promise<Usuario>;
  cerrarSesion(): Promise<void>;
  sesionActual(): Promise<Usuario | null>;
}

export interface RepositorioClientes {
  /** Catálogo completo. Con ~180 clientes activos la descarga de jornada es menor. */
  listar(): Promise<Cliente[]>;
  buscar(texto: string): Promise<Cliente[]>;
  obtener(id: Uuid): Promise<Cliente | null>;
}

export interface RepositorioSucursales {
  /** Direcciones de despacho activas de un cliente. El técnico elige entre ellas si hay más de una. */
  listarPorCliente(clienteId: Uuid): Promise<Sucursal[]>;
  obtener(id: Uuid): Promise<Sucursal | null>;
}

export interface RepositorioCilindros {
  obtenerPorCodigo(codigo: string): Promise<Cilindro | null>;
  obtener(id: Uuid): Promise<Cilindro | null>;
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
   * Deja el movimiento en la cola local de envío. Nace con `uuidLocal` y
   * `fechaEvento`; `fechaSync` la pone el servidor. Las pantallas no lo llaman
   * directo: pasan por `useSync().registrar`, que además dispara el envío.
   */
  registrar(movimiento: MovimientoNuevo): Promise<void>;
  /** Movimientos del día del vehículo: servidor + pendientes locales, sin duplicar. */
  listarDelDia(camionId: Uuid, fecha: Date): Promise<HistorialMovimientos>;
  /** Historial de un cilindro: servidor + pendientes locales, sin duplicar. */
  listarPorCilindro(cilindroId: Uuid): Promise<HistorialMovimientos>;
  /** Movimientos aún no enviados al servidor. */
  listarPendientes(): Promise<Movimiento[]>;
}

export interface Repositorios {
  auth: RepositorioAutenticacion;
  clientes: RepositorioClientes;
  sucursales: RepositorioSucursales;
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
