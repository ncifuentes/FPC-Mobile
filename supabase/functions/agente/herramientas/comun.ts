/**
 * Utilidades compartidas por las herramientas: fechas de Chile, normalización de textos,
 * validación de argumentos, lectura paginada y recorte de filas.
 *
 * Toda la operación es en Chile continental: los días se cuentan en America/Santiago, igual que
 * en la web (Web/src/lib/formato.ts).
 */
import type { Db } from './tipos.ts';

export const ZONA = 'America/Santiago';

/** Máximo de filas de detalle que una herramienta le entrega al modelo. */
export const MAX_FILAS = 50;

/** Error con un mensaje pensado para que el modelo se lo explique al usuario. */
export class ErrorHerramienta extends Error {}

// ------------------------------------------------------------------ fechas

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Día calendario de Chile, "AAAA-MM-DD". */
export function diaEnChile(instante: Date = new Date()): string {
  return formatoDia.format(instante);
}

/** "AAAA-MM-DD HH:MM" en hora de Chile. */
export function fechaHoraChile(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${diaEnChile(d)} ${formatoHora.format(d)}`;
}

/** Día de Chile de un instante ISO, o null. */
export function diaChileDe(iso: string | null): string | null {
  return iso ? diaEnChile(new Date(iso)) : null;
}

export function sumarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días calendario de a hasta b (b − a). */
export function diasEntre(a: string, b: string): number {
  const utc = (x: string) => {
    const [y, m, d] = x.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** Días que lleva en el cliente un cilindro desde `desdeIso` hasta hoy (días calendario de Chile). */
export function diasDesde(desdeIso: string | null, hoy: string = diaEnChile()): number | null {
  const dia = diaChileDe(desdeIso);
  return dia ? diasEntre(dia, hoy) : null;
}

function desfaseChile(instante: Date): string {
  const valor = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' })
    .formatToParts(instante)
    .find((p) => p.type === 'timeZoneName')
    ?.value.replace('GMT', '');
  return valor || 'Z';
}

/** Medianoche de un día de Chile como instante ISO con desfase ("2026-11-06T00:00:00-03:00"). */
export function inicioDelDiaEnChile(dia: string): string {
  return `${dia}T00:00:00${desfaseChile(new Date(`${dia}T12:00:00Z`))}`;
}

export function esDiaValido(dia: unknown): dia is string {
  return typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) && sumarDias(dia, 0) === dia;
}

// ------------------------------------------------------------------ textos

/** Serie como la guarda `cilindros.serie_normalizada`: mayúsculas y sin espacios. */
export function normalizarSerie(texto: string): string {
  return texto.replace(/\s/g, '').toUpperCase();
}

/** Minúsculas, sin tildes ni signos, espacios simples: para comparar nombres. */
export function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------ argumentos

export function argTexto(args: Record<string, unknown>, nombre: string, max = 100): string {
  const v = args[nombre];
  if (typeof v !== 'string' || !v.trim()) throw new ErrorHerramienta(`Falta el parámetro «${nombre}».`);
  if (v.length > max) throw new ErrorHerramienta(`El parámetro «${nombre}» es demasiado largo.`);
  return v.trim();
}

export function argTextoOpcional(args: Record<string, unknown>, nombre: string, max = 100): string | null {
  const v = args[nombre];
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  return argTexto(args, nombre, max);
}

export function argEntero(
  args: Record<string, unknown>,
  nombre: string,
  { min, max, defecto }: { min: number; max: number; defecto?: number },
): number {
  const crudo = args[nombre];
  if (crudo === undefined || crudo === null || crudo === '') {
    if (defecto !== undefined) return defecto;
    throw new ErrorHerramienta(`Falta el parámetro «${nombre}».`);
  }
  const v = Number(crudo);
  if (!Number.isInteger(v) || v < min || v > max) {
    throw new ErrorHerramienta(`«${nombre}» debe ser un entero entre ${min} y ${max}.`);
  }
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function argUuid(args: Record<string, unknown>, nombre: string): string {
  const v = args[nombre];
  if (typeof v !== 'string' || !UUID.test(v.trim())) {
    throw new ErrorHerramienta(`«${nombre}» no es un identificador válido. Usa buscar_cliente para obtenerlo.`);
  }
  return v.trim().toLowerCase();
}

export function argUuidOpcional(args: Record<string, unknown>, nombre: string): string | null {
  const v = args[nombre];
  return v === undefined || v === null || v === '' ? null : argUuid(args, nombre);
}

// ------------------------------------------------------------------ lecturas

/** Respuesta mínima de PostgREST que usamos. */
interface Resultado<T> {
  data: T[] | null;
  error: { message: string } | null;
}

const PAGINA = 1000; // tope de filas por respuesta de la API de Supabase

/**
 * Lee todas las filas de una consulta en páginas de 1.000 (la API corta ahí). `armar` debe
 * devolver la consulta con un orden estable y aplicarle `.range(desde, hasta)`.
 */
export async function leerTodo<T>(
  armar: (desde: number, hasta: number) => PromiseLike<Resultado<T>>,
  tope = 20000,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < tope; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return filas;
}

/** Verifica el error de una consulta simple y devuelve sus datos. */
export function datos<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Recorta una lista al máximo de filas e indica si había más. */
export function recortar<T>(lista: T[], limite = MAX_FILAS): { filas: T[]; total: number; hay_mas: boolean } {
  return { filas: lista.slice(0, limite), total: lista.length, hay_mas: lista.length > limite };
}

/** Promedio con un decimal, o null si no hay valores. */
export function promedio(valores: number[]): number | null {
  if (!valores.length) return null;
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10;
}

// ------------------------------------------------------------------ uniones

/** PostgREST devuelve una relación a-uno como objeto, pero el tipo puede venir como lista. */
export function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Columnas de un cilindro con su producto, ubicación y saldo inicial (sin datos sensibles). */
export const COLUMNAS_CILINDRO =
  'numero_serie, estado, en_cliente_desde, es_propiedad_cliente, ' +
  'producto:productos(codigo, nombre), ' +
  'sucursal:sucursales(nombre, cliente:clientes(id, nombre)), ' +
  'saldo:saldos_iniciales(desde)';

export interface CilindroCrudo {
  numero_serie: string;
  estado: 'en_planta' | 'en_camion' | 'en_cliente';
  en_cliente_desde: string | null;
  es_propiedad_cliente: boolean;
  producto: { codigo: string; nombre: string } | null;
  sucursal: { nombre: string; cliente: { id: string; nombre: string } | null } | null;
  saldo: { desde: string } | null;
}

/** Normaliza las uniones de un cilindro leído con COLUMNAS_CILINDRO. */
// deno-lint-ignore no-explicit-any
export function aCilindro(fila: any): CilindroCrudo {
  const sucursal = uno(fila.sucursal);
  return {
    numero_serie: fila.numero_serie,
    estado: fila.estado,
    en_cliente_desde: fila.en_cliente_desde,
    es_propiedad_cliente: fila.es_propiedad_cliente,
    producto: uno(fila.producto),
    sucursal: sucursal ? { nombre: sucursal.nombre, cliente: uno(sucursal.cliente) } : null,
    saldo: uno(fila.saldo),
  };
}

/** true si la ubicación actual del cilindro es la del saldo inicial (carga KAME). */
export function vieneDeSaldo(c: CilindroCrudo): boolean {
  return c.estado === 'en_cliente' && !!c.saldo && !!c.en_cliente_desde &&
    new Date(c.saldo.desde).getTime() === new Date(c.en_cliente_desde).getTime();
}

/** Nombre del cliente a partir de su id, o error claro si no existe o no es visible. */
export async function nombreCliente(db: Db, clienteId: string): Promise<string> {
  const fila = datos(await db.from('clientes').select('nombre').eq('id', clienteId).maybeSingle()) as
    | { nombre: string }
    | null;
  if (!fila) throw new ErrorHerramienta('No existe un cliente con ese identificador. Usa buscar_cliente.');
  return fila.nombre;
}
