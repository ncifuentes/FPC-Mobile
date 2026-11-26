/**
 * Datos de clientes: el listado de la cartera y la ficha de un cliente (HU-17).
 *
 * La cartera es chica (181 clientes, 190 sucursales), así que el listado se trae completo y se
 * filtra en el navegador. Los cilindros «en poder» de un cliente son los que están en estado
 * en_cliente con sucursal_actual_id en alguna de sus sucursales; el trigger de la base los
 * mantiene al día con cada entrega y retiro.
 */
import { supabase } from './supabase';
import type { Fila } from './database.types';

/** Dirección de la ficha. El sitio es estático: el cliente va como parámetro. */
export function urlFichaCliente(id: string | null): string {
  return id ? `/clientes/ficha?id=${encodeURIComponent(id)}` : '/clientes';
}

/** Dirección del informe de arriendo ya filtrado por un cliente. */
export function urlInforme(clienteId: string, mes?: string): string {
  const p = new URLSearchParams({ cliente: clienteId });
  if (mes) p.set('mes', mes);
  return `/informe?${p}`;
}

/** Texto para buscar: minúsculas, sin tildes, y el RUT sin puntos ni guion. */
export function textoBuscable(...partes: (string | null | undefined)[]): string {
  return partes
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)[.\-](?=\d|k)/g, '$1');
}

export function coincide(buscable: string, consulta: string): boolean {
  const palabras = textoBuscable(consulta).split(/\s+/).filter(Boolean);
  return palabras.every((p) => buscable.includes(p));
}

// ------------------------------------------------------------------ listado

export interface ClienteLista {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
  comuna: string | null;
  sucursales: number;
  cilindros: number;
  buscable: string;
}

export async function cargarCartera(): Promise<ClienteLista[]> {
  const [clientes, sucursales, enCliente] = await Promise.all([
    supabase.from('clientes').select('id, nombre, rut, activo').order('nombre'),
    supabase.from('sucursales').select('id, cliente_id, comuna, es_principal, activo'),
    supabase.from('cilindros').select('sucursal_actual_id').eq('estado', 'en_cliente').eq('activo', true),
  ]);
  if (clientes.error) throw clientes.error;
  if (sucursales.error) throw sucursales.error;
  if (enCliente.error) throw enCliente.error;

  const clienteDeSucursal = new Map(sucursales.data.map((s) => [s.id, s.cliente_id]));
  const cilindrosPorCliente = new Map<string, number>();
  for (const c of enCliente.data) {
    const cliente = c.sucursal_actual_id ? clienteDeSucursal.get(c.sucursal_actual_id) : undefined;
    if (cliente) cilindrosPorCliente.set(cliente, (cilindrosPorCliente.get(cliente) ?? 0) + 1);
  }

  return clientes.data.map((c) => {
    const propias = sucursales.data.filter((s) => s.cliente_id === c.id && s.activo);
    const principal = propias.find((s) => s.es_principal) ?? propias[0];
    return {
      id: c.id,
      nombre: c.nombre,
      rut: c.rut,
      activo: c.activo,
      comuna: principal?.comuna ?? null,
      sucursales: propias.length,
      cilindros: cilindrosPorCliente.get(c.id) ?? 0,
      buscable: textoBuscable(c.nombre, c.rut, ...propias.map((s) => s.comuna)),
    };
  });
}

// ------------------------------------------------------------------ ficha

export type Sucursal = Pick<
  Fila<'sucursales'>,
  'id' | 'nombre' | 'direccion' | 'comuna' | 'ciudad' | 'region' | 'contacto' | 'telefono' | 'email' | 'es_principal' | 'activo'
>;

export interface CilindroEnPoder {
  id: string;
  numero_serie: string;
  en_cliente_desde: string | null;
  sucursal_actual_id: string | null;
  productos: { nombre: string; codigo: string; envase_codigo: string } | null;
}

export type MovimientoCliente = Pick<
  Fila<'v_movimientos'>,
  | 'uuid_local'
  | 'tipo'
  | 'fecha_evento'
  | 'numero_serie'
  | 'producto_nombre'
  | 'sucursal_id'
  | 'sucursal_nombre'
  | 'tecnico_nombre'
  | 'patente'
  | 'codigo_origen'
  | 'folio_operacion'
>;

export interface FichaCliente {
  cliente: Pick<Fila<'clientes'>, 'id' | 'nombre' | 'rut' | 'codigo_kame' | 'activo'>;
  sucursales: Sucursal[];
  enPoder: CilindroEnPoder[];
}

export async function cargarFichaCliente(id: string): Promise<FichaCliente | null> {
  const cliente = await supabase.from('clientes').select('id, nombre, rut, codigo_kame, activo').eq('id', id).maybeSingle();
  if (cliente.error) {
    // Un id mal formado no es un error de conexión: es un cliente que no existe.
    if (cliente.error.code === '22P02') return null;
    throw cliente.error;
  }
  if (!cliente.data) return null;

  const sucursales = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, comuna, ciudad, region, contacto, telefono, email, es_principal, activo')
    .eq('cliente_id', id)
    .order('es_principal', { ascending: false })
    .order('nombre');
  if (sucursales.error) throw sucursales.error;

  const ids = sucursales.data.map((s) => s.id);
  const enPoder = ids.length
    ? await supabase
        .from('cilindros')
        .select('id, numero_serie, en_cliente_desde, sucursal_actual_id, productos(nombre, codigo, envase_codigo)')
        .eq('estado', 'en_cliente')
        .in('sucursal_actual_id', ids)
        .order('en_cliente_desde')
    : { data: [], error: null };
  if (enPoder.error) throw enPoder.error;

  return {
    cliente: cliente.data,
    sucursales: sucursales.data,
    enPoder: enPoder.data as CilindroEnPoder[],
  };
}

// ------------------------------------------------------------------ historial del cliente

/** Movimientos por página en el historial de la ficha. */
export const POR_PAGINA_HISTORIAL = 25;

export interface FiltrosHistorial {
  tipo: 'entrega' | 'retiro' | '';
  sucursalId: string;
  pagina: number;
}

/**
 * Entregas y retiros del cliente, del más reciente al más antiguo. Las cargas no tienen
 * cliente (ocurren en planta), así que nunca aparecen aquí.
 */
export async function cargarHistorialCliente(clienteId: string, f: FiltrosHistorial) {
  let consulta = supabase
    .from('v_movimientos')
    .select(
      'uuid_local, tipo, fecha_evento, numero_serie, producto_nombre, sucursal_id, sucursal_nombre, tecnico_nombre, patente, codigo_origen, folio_operacion',
      { count: 'exact' },
    )
    .eq('cliente_id', clienteId)
    .order('fecha_evento', { ascending: false })
    .range(f.pagina * POR_PAGINA_HISTORIAL, f.pagina * POR_PAGINA_HISTORIAL + POR_PAGINA_HISTORIAL - 1);
  if (f.tipo) consulta = consulta.eq('tipo', f.tipo);
  if (f.sucursalId) consulta = consulta.eq('sucursal_id', f.sucursalId);
  const { data, count, error } = await consulta;
  if (error) throw error;
  return { filas: data as MovimientoCliente[], total: count ?? 0 };
}
