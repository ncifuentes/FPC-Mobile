/**
 * Contrato de una herramienta del agente.
 *
 * Cada herramienta es de SOLO LECTURA: consulta con el cliente de Supabase que recibe (creado con
 * el JWT de quien pregunta, así que aplica la misma RLS que la web) y devuelve un objeto JSON que
 * el modelo lee. Nunca devuelve RUT, teléfonos, correos ni direcciones.
 *
 * Solo se importan tipos: así las herramientas también corren en Node (pruebas) sin Deno.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type Db = SupabaseClient;

export interface PropiedadParametro {
  type: 'string' | 'integer' | 'number' | 'boolean';
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

/** Subconjunto de JSON Schema que entienden tanto Gemini como Claude. */
export interface EsquemaParametros {
  type: 'object';
  properties: Record<string, PropiedadParametro>;
  required?: string[];
}

export interface Herramienta {
  nombre: string;
  /** Lo que el modelo lee para decidir cuándo usarla. */
  descripcion: string;
  parametros: EsquemaParametros;
  ejecutar(db: Db, args: Record<string, unknown>): Promise<unknown>;
}
