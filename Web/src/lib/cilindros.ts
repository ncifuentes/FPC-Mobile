/**
 * Datos de cilindros: el listado buscable y la ficha de un envase (HU-16).
 *
 * La ubicación actual sale de cilindros.estado, sucursal_actual_id y en_cliente_desde, que
 * mantiene el trigger de la base a partir del último movimiento. El historial sale de
 * v_movimientos filtrada por cilindro_id.
 */
import { supabase } from './supabase';
import type { Enum, Fila } from './database.types';
import { normalizarSerie } from './tablero';

export type Estado = Enum<'estado_cilindro'>;

/** Dirección de la ficha de un cilindro. El sitio es estático: la serie va como parámetro. */
export function urlFicha(serie: string | null): string {
  return serie ? `/cilindros/ficha?serie=${encodeURIComponent(serie)}` : '/cilindros';
}

// ------------------------------------------------------------------ volver a la lista

const CLAVE_LISTA = 'fpc:lista-cilindros';

/** Recuerda la última vista del listado (búsqueda, estado y página) para poder volver a ella. */
export function recordarLista(url: string): void {
  try {
    sessionStorage.setItem(CLAVE_LISTA, url);
  } catch {
    // Sin almacenamiento (modo privado estricto): «volver» lleva al listado completo.
  }
}

/**
 * A dónde lleva el botón «Volver» de la ficha: a la pantalla desde la que se llegó si fue el
 * tablero o el inicio; si no, al listado tal como se dejó.
 */
export function destinoVolver(): { href: string; texto: string } {
  try {
    if (document.referrer) {
      const desde = new URL(document.referrer);
      if (desde.origin === window.location.origin) {
        if (desde.pathname.startsWith('/tablero')) return { href: desde.pathname + desde.search, texto: 'Volver al tablero' };
        if (desde.pathname === '/') return { href: '/', texto: 'Volver al inicio' };
      }
    }
  } catch {
    // referrer ilegible: se usa el listado
  }
  let lista = '/cilindros';
  try {
    lista = sessionStorage.getItem(CLAVE_LISTA) ?? lista;
  } catch {
    // sin almacenamiento
  }
  return { href: lista.startsWith('/cilindros') ? lista : '/cilindros', texto: 'Volver a la lista de cilindros' };
}

/** Deja solo lo que puede ir en un patrón ilike sin cambiar su sentido. */
function paraPatron(texto: string): string {
  return normalizarSerie(texto).replace(/[%_*,()\\]/g, '');
}

// ------------------------------------------------------------------ listado

export const POR_PAGINA = 50;

const COLUMNAS_LISTA =
  'id, numero_serie, estado, deposito, en_cliente_desde, productos(nombre, envase_codigo), sucursales(nombre, clientes(nombre))';

export interface FiltrosLista {
  busqueda: string;
  estado: Estado | '';
  pagina: number;
}

export async function buscarCilindros(f: FiltrosLista) {
  let consulta = supabase
    .from('cilindros')
    .select(COLUMNAS_LISTA, { count: 'exact' })
    .eq('activo', true)
    .order('numero_serie')
    .range(f.pagina * POR_PAGINA, f.pagina * POR_PAGINA + POR_PAGINA - 1);
  const patron = paraPatron(f.busqueda);
  if (patron) consulta = consulta.ilike('serie_normalizada', `%${patron}%`);
  if (f.estado) consulta = consulta.eq('estado', f.estado);
  const { data, count, error } = await consulta;
  if (error) throw error;
  return { filas: data, total: count ?? 0 };
}

export type FilaLista = Awaited<ReturnType<typeof buscarCilindros>>['filas'][number];

// ------------------------------------------------------------------ ficha

// Las columnas van en una sola cadena literal para que supabase-js infiera el tipo de la fila.
export async function cargarCilindro(serie: string) {
  const { data, error } = await supabase
    .from('cilindros')
    .select(
      'id, numero_serie, serie_normalizada, codigo_barras, deposito, estado, en_cliente_desde, activo, productos(codigo, envase_codigo, nombre, gas_habitual, tipo_envase, capacidad, unidad), sucursales(id, nombre, direccion, comuna, clientes(id, nombre, rut))',
    )
    .eq('serie_normalizada', normalizarSerie(serie))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type Cilindro = NonNullable<Awaited<ReturnType<typeof cargarCilindro>>>;

export type MovimientoHistorial = Pick<
  Fila<'v_movimientos'>,
  | 'uuid_local'
  | 'tipo'
  | 'fecha_evento'
  | 'fecha_sync'
  | 'codigo_origen'
  | 'folio_operacion'
  | 'sucursal_nombre'
  | 'cliente_nombre'
  | 'tecnico_nombre'
  | 'patente'
>;

/** Tope del historial en pantalla: un envase acumula del orden de un ciclo por semana. */
export const MAXIMO_HISTORIAL = 500;

export async function cargarHistorial(cilindroId: string): Promise<MovimientoHistorial[]> {
  const { data, error } = await supabase
    .from('v_movimientos')
    .select('uuid_local, tipo, fecha_evento, fecha_sync, codigo_origen, folio_operacion, sucursal_nombre, cliente_nombre, tecnico_nombre, patente')
    .eq('cilindro_id', cilindroId)
    .order('fecha_evento', { ascending: false })
    .limit(MAXIMO_HISTORIAL);
  if (error) throw error;
  return data;
}

/** Sugerencias de series parecidas cuando la buscada no existe. */
export async function seriesParecidas(serie: string): Promise<string[]> {
  const patron = paraPatron(serie);
  if (patron.length < 3) return [];
  const { data, error } = await supabase
    .from('cilindros')
    .select('numero_serie')
    .ilike('serie_normalizada', `%${patron}%`)
    .order('numero_serie')
    .limit(8);
  if (error) return [];
  return data.map((c) => c.numero_serie);
}
