/**
 * Interfaz común de los proveedores de modelos. index.ts, las herramientas y el contexto solo
 * conocen estos tipos; cada adaptador (gemini.ts, y más adelante claude.ts) traduce desde y hacia
 * el formato de su API.
 */
import type { EsquemaParametros } from '../herramientas/tipos.ts';

export interface LlamadaHerramienta {
  /** Id que asigna el proveedor, si lo usa (Claude lo exige para emparejar el resultado). */
  id?: string;
  nombre: string;
  argumentos: Record<string, unknown>;
}

export interface ResultadoHerramienta {
  id?: string;
  nombre: string;
  /** JSON devuelto por la herramienta, o `{ error }` si falló. */
  resultado: unknown;
}

export type Mensaje =
  | { rol: 'usuario'; texto: string }
  /**
   * Turno del modelo. `crudo` guarda el contenido exacto que devolvió el proveedor, para
   * reenviarlo tal cual (Gemini exige devolver sus firmas de pensamiento; Claude, sus bloques).
   */
  | { rol: 'modelo'; texto?: string; llamadas?: LlamadaHerramienta[]; crudo?: unknown }
  | { rol: 'herramientas'; resultados: ResultadoHerramienta[] };

export interface DeclaracionHerramienta {
  nombre: string;
  descripcion: string;
  parametros: EsquemaParametros;
}

export interface PeticionModelo {
  sistema: string;
  mensajes: Mensaje[];
  herramientas: DeclaracionHerramienta[];
  /** false cuando ya se gastaron las llamadas permitidas: el modelo debe responder con texto. */
  permitirHerramientas: boolean;
  senal: AbortSignal;
}

/** `modelo`: el modelo que respondió de verdad (puede ser el de respaldo). */
export type RespuestaModelo =
  | { tipo: 'texto'; texto: string; crudo?: unknown; modelo?: string }
  | { tipo: 'herramientas'; llamadas: LlamadaHerramienta[]; texto?: string; crudo?: unknown; modelo?: string };

export interface Proveedor {
  nombre: string;
  llamarModelo(peticion: PeticionModelo): Promise<RespuestaModelo>;
}

/**
 * Error del proveedor. `limite`: cuota o tasa excedida (429), se muestra «el asistente está
 * ocupado». `config`: falta la clave o el modelo no existe. `otro`: cualquier otra falla.
 */
export class ErrorProveedor extends Error {
  tipo: 'limite' | 'config' | 'otro';
  constructor(mensaje: string, tipo: 'limite' | 'config' | 'otro') {
    super(mensaje);
    this.tipo = tipo;
  }
}
