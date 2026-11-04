/**
 * Corrección de movimientos (HU-18).
 *
 * Solo el admin puede actualizar `movimientos` (política movimientos_update_admin) y no hay
 * política de borrado: un movimiento mal registrado se corrige, no se elimina. Cada cambio
 * queda en `movimientos_auditoria` con el antes, el después, quién y cuándo (trigger de la base),
 * y el trigger de estado vuelve a calcular dónde está el cilindro.
 */
import { supabase } from './supabase';
import type { Enum, Json } from './database.types';
import { mensajeDeError } from './mantenedores';

export type Tipo = Enum<'tipo_movimiento'>;

export interface CorreccionMovimiento {
  tipo: Tipo;
  fecha_evento: string;
  /** null solo en una carga (la carga ocurre en planta, sin cliente). */
  sucursal_id: string | null;
}

export interface OpcionSucursal {
  id: string;
  nombre: string;
  cliente: string;
  rut: string;
  activo: boolean;
}

export async function listarSucursalesConCliente(): Promise<OpcionSucursal[]> {
  const { data, error } = await supabase.from('sucursales').select('id, nombre, activo, clientes(nombre, rut)');
  if (error) throw error;
  return data
    .map((s) => ({
      id: s.id,
      nombre: s.nombre,
      activo: s.activo,
      cliente: (s.clientes as { nombre: string; rut: string } | null)?.nombre ?? '',
      rut: (s.clientes as { nombre: string; rut: string } | null)?.rut ?? '',
    }))
    .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.nombre.localeCompare(b.nombre));
}

export async function corregirMovimiento(uuid: string, c: CorreccionMovimiento): Promise<void> {
  const { data, error } = await supabase
    .from('movimientos')
    .update({ tipo: c.tipo, fecha_evento: c.fecha_evento, sucursal_id: c.tipo === 'carga' ? null : c.sucursal_id })
    .eq('uuid_local', uuid)
    .select('uuid_local');
  if (error) {
    if (error.code === '23514') throw new Error('Una carga no lleva cliente, y una entrega o un retiro siempre lo llevan.');
    throw new Error(mensajeDeError(error));
  }
  // Sin filas afectadas: la RLS no dejó actualizar (no es admin) o el movimiento ya no existe.
  if (!data?.length) throw new Error('No se pudo guardar la corrección: solo un administrador puede corregir movimientos.');
}

export interface RegistroAuditoria {
  id: number;
  movimiento_uuid: string;
  operacion: string;
  datos_antes: Json;
  datos_despues: Json | null;
  cambiado_por: string | null;
  cambiado_en: string;
}

/** Correcciones registradas de un conjunto de movimientos (los de un cilindro). */
export async function cargarAuditoria(uuids: string[]): Promise<RegistroAuditoria[]> {
  if (uuids.length === 0) return [];
  const { data, error } = await supabase
    .from('movimientos_auditoria')
    .select('id, movimiento_uuid, operacion, datos_antes, datos_despues, cambiado_por, cambiado_en')
    .in('movimiento_uuid', uuids)
    .order('cambiado_en', { ascending: false });
  if (error) throw error;
  return data;
}

/** Nombres de quienes corrigieron (usuarios es legible para admin y gerente). */
export async function nombresDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data } = await supabase.from('usuarios').select('id, nombre').in('id', unicos);
  return new Map((data ?? []).map((u) => [u.id, u.nombre]));
}

/** Qué cambió entre el antes y el después, en palabras. */
export function cambios(antes: Json, despues: Json | null, sucursal: (id: string | null) => string): string[] {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  const lista: string[] = [];
  if (a.tipo !== d.tipo) lista.push(`tipo: ${a.tipo} → ${d.tipo}`);
  if (a.fecha_evento !== d.fecha_evento) lista.push('fecha y hora');
  if (a.sucursal_id !== d.sucursal_id)
    lista.push(`sucursal: ${sucursal(a.sucursal_id as string | null)} → ${sucursal(d.sucursal_id as string | null)}`);
  if (a.cilindro_id !== d.cilindro_id) lista.push('cilindro');
  return lista.length ? lista : ['sin cambios visibles'];
}
