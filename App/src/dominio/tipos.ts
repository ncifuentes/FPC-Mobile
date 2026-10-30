/**
 * Tipos del dominio de FPC Mobile.
 *
 * Reflejan el esquema real de Supabase (siete tablas: `clientes`, `sucursales`,
 * `productos`, `cilindros`, `movimientos`, `usuarios`, `camiones`), no el modelo
 * de cinco tablas con el que arrancó el proyecto. El cliente no tiene dirección
 * ni rubro propios: eso vive en sus sucursales. El cilindro no apunta a un
 * cliente: apunta a una sucursal (`sucursal_actual_id`), y el tipo de gas, la
 * capacidad y el tipo de envase vienen de `productos` por `producto_id`.
 *
 * Las pantallas no deberían cambiar más que lo necesario: hablan con los
 * repositorios de `src/dominio/repositorios.ts`, no con la base de datos.
 */

export type Uuid = string;

/** ISO 8601 con zona horaria, p. ej. "2026-04-12T08:15:00-04:00". */
export type FechaIso = string;

/** Roles definidos por las políticas RLS. Hoy existen 2 técnicos y 2 admin. */
export type Rol = 'tecnico' | 'admin' | 'gerente';

/**
 * El parque se describe en m³ (de 1 a 90, termos de 100) y en kg (termos de 195).
 * Por eso se guarda valor + unidad, no solo kg.
 */
export type UnidadCapacidad = 'm3' | 'kg';

/** El cliente describe tres formatos distintos de envase. */
export type TipoEnvase = 'cilindro' | 'paquete' | 'termo';

/**
 * Estado del cilindro. En Postgres es un dato derivado que mantiene un trigger a
 * partir del historial de movimientos; en el teléfono es una proyección local.
 */
export type EstadoCilindro = 'en_planta' | 'en_camion' | 'en_cliente';

/** Las tres operaciones sobre el activo retornable. */
export type TipoMovimiento = 'carga' | 'entrega' | 'retiro';

/** Cómo se capturó el código del envase. El ingreso manual es requisito obligatorio. */
export type OrigenCodigo = 'escaner' | 'manual';

export interface Usuario {
  id: Uuid;
  nombre: string;
  usuario: string;
  rol: Rol;
  camionAsignadoId: Uuid | null;
}

export interface Camion {
  id: Uuid;
  patente: string;
  descripcion: string;
  /** 30 para el camión, 16 para la camioneta. Permite avisar por sobrecarga. */
  capacidadCilindros: number;
  activo: boolean;
}

export interface Cliente {
  id: Uuid;
  /** Único y normalizado. No es la clave primaria: el RUT genérico 55.555.555-5 existe. */
  rut: string;
  /** Código de cliente en KAME ONE. No todos lo traen: puede ser null. */
  codigoKame: string | null;
  nombre: string;
  activo: boolean;
}

/**
 * Dirección de despacho de un cliente. Un cliente tiene una o más; el técnico
 * elige primero el cliente y, si tiene más de una sucursal activa, cuál.
 */
export interface Sucursal {
  id: Uuid;
  clienteId: Uuid;
  nombre: string;
  direccion: string;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  esPrincipal: boolean;
  activo: boolean;
}

export interface Cilindro {
  id: Uuid;
  /** Código de barras de fábrica si lo trae; si no, el número de serie. Para mostrar y buscar. */
  codigo: string;
  numeroSerie: string;
  codigoBarras: string | null;
  tipoEnvase: TipoEnvase;
  /** Tipo de gas rotulado de fábrica. Algunos productos del catálogo no lo traen. */
  tipoGas: string | null;
  /**
   * Null solo en el código PRO (propiedad del cliente): KAME no guarda
   * capacidad de envases que no son de FPC.
   */
  capacidadValor: number | null;
  capacidadUnidad: UnidadCapacidad | null;
  estado: EstadoCilindro;
  sucursalActualId: Uuid | null;
  /** Base del cálculo de arriendo: se cobra por día desde la entrega hasta el retiro. */
  enClienteDesde: FechaIso | null;
  /** true si el cilindro se dio de alta sin código de barras de fábrica. */
  codigoGenerado: boolean;
}

export interface Movimiento {
  /** Identidad local del movimiento. Índice único en Postgres: reintentar no duplica. */
  uuidLocal: Uuid;
  tipo: TipoMovimiento;
  cilindroId: Uuid;
  /** null en los movimientos de tipo "carga". */
  sucursalId: Uuid | null;
  usuarioId: Uuid;
  camionId: Uuid;
  /** Cuándo ocurrió en terreno. */
  fechaEvento: FechaIso;
  /** Cuándo llegó al servidor. null mientras está en la cola local. */
  fechaSync: FechaIso | null;
  origenCodigo: OrigenCodigo;
}

/** Movimiento acompañado de los datos que la interfaz necesita mostrar. */
export interface MovimientoDetallado extends Movimiento {
  codigoCilindro: string;
  nombreCliente: string | null;
  nombreSucursal: string | null;
  nombreUsuario: string;
}

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  carga: 'Carga',
  entrega: 'Entrega',
  retiro: 'Retiro',
};

export const ETIQUETA_ESTADO: Record<EstadoCilindro, string> = {
  en_planta: 'En planta',
  en_camion: 'En camión',
  en_cliente: 'En cliente',
};

export function formatearCapacidad(c: Pick<Cilindro, 'capacidadValor' | 'capacidadUnidad'>): string {
  if (c.capacidadValor == null || c.capacidadUnidad == null) return 'Propiedad del cliente';
  return c.capacidadUnidad === 'm3' ? `${c.capacidadValor} m³` : `${c.capacidadValor} kg`;
}
