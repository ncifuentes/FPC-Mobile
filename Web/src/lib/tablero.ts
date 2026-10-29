/**
 * Datos del tablero del día (HU-15, HU-19).
 *
 * Los contadores del parque salen de cilindros.estado, que mantiene el trigger de la base.
 * Los movimientos del día salen de v_movimientos filtrada por fecha_evento (hora real de
 * terreno) dentro del día calendario de Chile. Las agrupaciones por camión se calculan aquí,
 * sobre los movimientos ya descargados: un día trae a lo sumo unos cientos de filas.
 */
import { supabase } from './supabase';
import type { Enum, Fila } from './database.types';
import { rangoDelDia } from './formato';

export type Tipo = Enum<'tipo_movimiento'>;
type Estado = Enum<'estado_cilindro'>;

export type MovimientoDia = Pick<
  Fila<'v_movimientos'>,
  | 'uuid_local'
  | 'tipo'
  | 'fecha_evento'
  | 'fecha_sync'
  | 'codigo_origen'
  | 'numero_serie'
  | 'serie_normalizada'
  | 'producto_nombre'
  | 'sucursal_nombre'
  | 'cliente_nombre'
  | 'usuario_id'
  | 'tecnico_nombre'
  | 'camion_id'
  | 'patente'
>;

/** A partir de este retraso entre el terreno y el servidor, la fila se marca en el tablero. */
export const MINUTOS_RETRASO_AVISO = 30;

/** Tope de filas por día: muy por encima de la operación real (decenas a pocos cientos). */
export const MAXIMO_FILAS_DIA = 2000;

// En una sola cadena literal para que supabase-js infiera el tipo de cada fila.
const COLUMNAS =
  'uuid_local, tipo, fecha_evento, fecha_sync, codigo_origen, numero_serie, serie_normalizada, producto_nombre, sucursal_nombre, cliente_nombre, usuario_id, tecnico_nombre, camion_id, patente';

async function contarEstado(estado: Estado): Promise<number> {
  const { count, error } = await supabase
    .from('cilindros')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('estado', estado);
  if (error) throw error;
  return count ?? 0;
}

export async function cargarParque(): Promise<Record<Estado, number>> {
  const [en_planta, en_camion, en_cliente] = await Promise.all([
    contarEstado('en_planta'),
    contarEstado('en_camion'),
    contarEstado('en_cliente'),
  ]);
  return { en_planta, en_camion, en_cliente };
}

export async function cargarMovimientosDelDia(dia: string): Promise<MovimientoDia[]> {
  const { desde, hasta } = rangoDelDia(dia);
  const { data, error } = await supabase
    .from('v_movimientos')
    .select(COLUMNAS)
    .gte('fecha_evento', desde)
    .lt('fecha_evento', hasta)
    .order('fecha_evento', { ascending: false })
    .limit(MAXIMO_FILAS_DIA);
  if (error) throw error;
  return data;
}

/** Último día (de Chile) con al menos un movimiento antes del día dado, o null si no hay. */
export async function ultimoDiaConMovimientos(antesDe: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('fecha_evento')
    .lt('fecha_evento', rangoDelDia(antesDe).desde)
    .order('fecha_evento', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.fecha_evento ?? null;
}

export async function cargarCamiones(): Promise<Pick<Fila<'camiones'>, 'id' | 'patente' | 'descripcion'>[]> {
  const { data, error } = await supabase.from('camiones').select('id, patente, descripcion').order('patente');
  if (error) throw error;
  return data;
}

/** Minutos entre que ocurrió el movimiento en terreno y que llegó al servidor. */
export function minutosDeRetraso(m: Pick<MovimientoDia, 'fecha_evento' | 'fecha_sync'>): number {
  if (!m.fecha_evento || !m.fecha_sync) return 0;
  return (new Date(m.fecha_sync).getTime() - new Date(m.fecha_evento).getTime()) / 60000;
}

export function llegoConRetraso(m: Pick<MovimientoDia, 'fecha_evento' | 'fecha_sync'>): boolean {
  return minutosDeRetraso(m) >= MINUTOS_RETRASO_AVISO;
}

export type ConteoTipos = Record<Tipo, number>;

export function contarPorTipo(movimientos: Pick<MovimientoDia, 'tipo'>[]): ConteoTipos {
  const conteo: ConteoTipos = { carga: 0, entrega: 0, retiro: 0 };
  for (const m of movimientos) if (m.tipo) conteo[m.tipo] += 1;
  return conteo;
}

export interface ResumenCamion {
  camionId: string;
  patente: string;
  tecnicos: string[];
  conteo: ConteoTipos;
  ultimoRecibido: string | null;
  conRetraso: number;
}

/** Agrupa los movimientos del día por vehículo, ordenados por patente. */
export function resumirPorCamion(movimientos: MovimientoDia[]): ResumenCamion[] {
  const grupos = new Map<string, ResumenCamion>();
  for (const m of movimientos) {
    if (!m.camion_id) continue;
    let g = grupos.get(m.camion_id);
    if (!g) {
      g = {
        camionId: m.camion_id,
        patente: m.patente ?? '—',
        tecnicos: [],
        conteo: { carga: 0, entrega: 0, retiro: 0 },
        ultimoRecibido: null,
        conRetraso: 0,
      };
      grupos.set(m.camion_id, g);
    }
    if (m.tipo) g.conteo[m.tipo] += 1;
    if (m.tecnico_nombre && !g.tecnicos.includes(m.tecnico_nombre)) g.tecnicos.push(m.tecnico_nombre);
    if (m.fecha_sync && (!g.ultimoRecibido || m.fecha_sync > g.ultimoRecibido)) g.ultimoRecibido = m.fecha_sync;
    if (llegoConRetraso(m)) g.conRetraso += 1;
  }
  return [...grupos.values()].sort((a, b) => a.patente.localeCompare(b.patente));
}

/** Serie en mayúsculas y sin espacios: la misma regla que cilindros.serie_normalizada. */
export function normalizarSerie(texto: string): string {
  return texto.replace(/\s/g, '').toUpperCase();
}

export interface Filtros {
  tipo: Tipo | '';
  camionId: string;
  serie: string;
}

export function filtrar(movimientos: MovimientoDia[], f: Filtros): MovimientoDia[] {
  const serie = normalizarSerie(f.serie);
  return movimientos.filter(
    (m) =>
      (!f.tipo || m.tipo === f.tipo) &&
      (!f.camionId || m.camion_id === f.camionId) &&
      (!serie || (m.serie_normalizada ?? '').includes(serie)),
  );
}
