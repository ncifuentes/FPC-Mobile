/**
 * Mantenedores de la plataforma web (HU-12, HU-13 y HU-14): clientes y sucursales, cilindros,
 * usuarios y camiones.
 *
 * Quién puede escribir lo decide la base: las políticas RLS dejan insertar y actualizar solo al
 * admin. La interfaz esconde los botones al gerente (HU-20), pero aunque los forzara, la base lo
 * rechaza. No se borran registros: dar de baja es dejar `activo = false`, porque el historial de
 * movimientos los referencia.
 */
import { supabase } from './supabase';
import type { Enum, Fila } from './database.types';

// ------------------------------------------------------------------ errores

/** Traduce un error de PostgREST/Postgres a un mensaje para el usuario. */
export function mensajeDeError(error: { code?: string; message?: string } | null, contexto = ''): string {
  if (!error) return 'Ocurrió un error inesperado.';
  const m = error.message ?? '';
  if (error.code === '23505') {
    if (/rut/.test(m)) return 'Ya existe un cliente con ese RUT.';
    if (/codigo_kame/.test(m)) return 'Ese código KAME ya está asignado a otro cliente.';
    if (/patente/.test(m)) return 'Ya existe un camión con esa patente.';
    if (/serie/.test(m)) return 'Ya existe un cilindro con ese número de serie (se comparan sin espacios ni mayúsculas).';
    if (/codigo_barras/.test(m)) return 'Ese código de barras ya está asignado a otro cilindro.';
    if (/cliente_id_nombre/.test(m)) return 'Este cliente ya tiene una sucursal con ese nombre.';
    if (/usuarios_pkey/.test(m)) return 'Esa cuenta ya tiene un perfil.';
    return `Ya existe un registro con esos datos${contexto ? ` (${contexto})` : ''}.`;
  }
  if (error.code === '23514') {
    if (/rut/.test(m)) return 'El RUT no tiene un formato válido.';
    if (/patente/.test(m)) return 'La patente debe ir en mayúsculas y sin guion.';
    if (/capacidad/.test(m)) return 'La capacidad debe ser mayor que cero.';
    return 'Algún dato no cumple las reglas de la base.';
  }
  if (error.code === '42501' || /row-level security/i.test(m)) return 'No tienes permiso para hacer este cambio.';
  if (/fetch|network/i.test(m)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  return m || 'Ocurrió un error inesperado.';
}

/** Texto vacío → null, para no guardar cadenas vacías en columnas opcionales. */
export const nulo = (t: string): string | null => (t.trim() === '' ? null : t.trim());

// ------------------------------------------------------------------ RUT

/** Deja el RUT como lo guarda la base: sin puntos, con guion y la K en mayúscula. */
export function normalizarRut(texto: string): string {
  const limpio = texto.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return limpio;
  return `${limpio.slice(0, -1).replace(/^0+/, '')}-${limpio.slice(-1)}`;
}

/** Dígito verificador de un RUT chileno (módulo 11). */
export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

/** null si el RUT es válido; si no, el motivo. */
export function validarRut(rut: string): string | null {
  if (!/^[0-9]{1,8}-[0-9K]$/.test(rut)) return 'Escribe el RUT con su dígito verificador, por ejemplo 76123456-7.';
  const [cuerpo, dv] = rut.split('-');
  if (digitoVerificador(cuerpo) !== dv) return `El dígito verificador no corresponde (debería ser ${digitoVerificador(cuerpo)}).`;
  return null;
}

// ------------------------------------------------------------------ patente

/** Patente como la guarda la base: mayúsculas, sin guion ni espacios. */
export function normalizarPatente(texto: string): string {
  return texto.replace(/[\s\-·.]/g, '').toUpperCase();
}

/** Formatos chilenos: antiguo (AB1234) y nuevo (BCDF12). Solo es un aviso, no bloquea. */
export function patenteConFormatoChileno(p: string): boolean {
  return /^[A-Z]{2}\d{4}$/.test(p) || /^[A-Z]{4}\d{2}$/.test(p);
}

// ------------------------------------------------------------------ clientes y sucursales

export type Cliente = Pick<Fila<'clientes'>, 'id' | 'nombre' | 'rut' | 'codigo_kame' | 'activo'>;
export type Sucursal = Pick<
  Fila<'sucursales'>,
  'id' | 'cliente_id' | 'nombre' | 'direccion' | 'comuna' | 'ciudad' | 'region' | 'contacto' | 'telefono' | 'email' | 'es_principal' | 'activo'
>;

/** Regiones donde opera FPC (las que ya están en la cartera). Se puede escribir otra. */
export const REGIONES = ['Metropolitana', 'Valparaiso', 'O’Higgins', 'Maule', 'La Araucania', 'Los Rios'];

export async function listarClientes(): Promise<(Cliente & { sucursales: number })[]> {
  const [c, s] = await Promise.all([
    supabase.from('clientes').select('id, nombre, rut, codigo_kame, activo').order('nombre'),
    supabase.from('sucursales').select('cliente_id'),
  ]);
  if (c.error) throw c.error;
  if (s.error) throw s.error;
  const cuenta = new Map<string, number>();
  for (const x of s.data) cuenta.set(x.cliente_id, (cuenta.get(x.cliente_id) ?? 0) + 1);
  return c.data.map((x) => ({ ...x, sucursales: cuenta.get(x.id) ?? 0 }));
}

export async function guardarCliente(c: Omit<Cliente, 'id'> & { id?: string }): Promise<Cliente> {
  const fila = { nombre: c.nombre.trim(), rut: c.rut, codigo_kame: c.codigo_kame, activo: c.activo };
  const r = c.id
    ? await supabase.from('clientes').update(fila).eq('id', c.id).select('id, nombre, rut, codigo_kame, activo').single()
    : await supabase.from('clientes').insert(fila).select('id, nombre, rut, codigo_kame, activo').single();
  if (r.error) throw new Error(mensajeDeError(r.error));
  return r.data;
}

const COLUMNAS_SUCURSAL = 'id, cliente_id, nombre, direccion, comuna, ciudad, region, contacto, telefono, email, es_principal, activo';

export async function listarSucursales(clienteId: string): Promise<Sucursal[]> {
  const { data, error } = await supabase
    .from('sucursales')
    .select(COLUMNAS_SUCURSAL)
    .eq('cliente_id', clienteId)
    .order('es_principal', { ascending: false })
    .order('nombre');
  if (error) throw error;
  return data;
}

/**
 * Guarda una sucursal. Si queda como principal, las demás sucursales del cliente dejan de serlo
 * (un cliente tiene una sola principal).
 */
export async function guardarSucursal(s: Omit<Sucursal, 'id'> & { id?: string }): Promise<Sucursal> {
  const { id, ...fila } = s;
  const r = id
    ? await supabase.from('sucursales').update(fila).eq('id', id).select(COLUMNAS_SUCURSAL).single()
    : await supabase.from('sucursales').insert(fila).select(COLUMNAS_SUCURSAL).single();
  if (r.error) throw new Error(mensajeDeError(r.error));
  if (r.data.es_principal) {
    const otras = await supabase
      .from('sucursales')
      .update({ es_principal: false })
      .eq('cliente_id', r.data.cliente_id)
      .neq('id', r.data.id)
      .eq('es_principal', true);
    if (otras.error) throw new Error(mensajeDeError(otras.error));
  }
  return r.data;
}

// ------------------------------------------------------------------ cilindros

export type Producto = Pick<Fila<'productos'>, 'id' | 'nombre' | 'envase_codigo' | 'codigo' | 'capacidad' | 'unidad' | 'activo'>;
export type CilindroMant = Pick<
  Fila<'cilindros'>,
  'id' | 'numero_serie' | 'codigo_barras' | 'producto_id' | 'deposito' | 'estado' | 'activo' | 'es_propiedad_cliente'
> & { productos: { nombre: string; envase_codigo: string } | null };

export const POR_PAGINA_CILINDROS = 50;

export async function listarProductos(): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, envase_codigo, codigo, capacidad, unidad, activo')
    .order('nombre');
  if (error) throw error;
  return data;
}

export async function buscarCilindrosMant(busqueda: string, soloActivos: boolean, pagina: number) {
  let q = supabase
    .from('cilindros')
    .select('id, numero_serie, codigo_barras, producto_id, deposito, estado, activo, es_propiedad_cliente, productos(nombre, envase_codigo)', {
      count: 'exact',
    })
    .order('numero_serie')
    .range(pagina * POR_PAGINA_CILINDROS, pagina * POR_PAGINA_CILINDROS + POR_PAGINA_CILINDROS - 1);
  const patron = busqueda.replace(/\s/g, '').toUpperCase().replace(/[%_*,()\\]/g, '');
  if (patron) q = q.ilike('serie_normalizada', `%${patron}%`);
  if (soloActivos) q = q.eq('activo', true);
  const { data, count, error } = await q;
  if (error) throw error;
  return { filas: data as CilindroMant[], total: count ?? 0 };
}

/**
 * Guarda un cilindro. El estado, la sucursal actual y la fecha de entrega no se editan aquí:
 * los calcula el trigger a partir de los movimientos. `es_propiedad_cliente` se deja igual a
 * «el producto es de categoría PRO», que es el criterio de exclusión del arriendo
 * (bitácora 27-10) y como se cargó el parque.
 */
export async function guardarCilindro(
  c: { id?: string; numero_serie: string; codigo_barras: string | null; producto_id: string; deposito: string | null; activo: boolean },
  esPro: boolean,
): Promise<void> {
  const fila = { ...c, numero_serie: c.numero_serie.trim(), es_propiedad_cliente: esPro };
  delete (fila as { id?: string }).id;
  const r = c.id ? await supabase.from('cilindros').update(fila).eq('id', c.id) : await supabase.from('cilindros').insert(fila);
  if (r.error) throw new Error(mensajeDeError(r.error));
}

// ------------------------------------------------------------------ camiones

export type Camion = Pick<Fila<'camiones'>, 'id' | 'patente' | 'descripcion' | 'capacidad_cilindros' | 'activo'>;

export async function listarCamiones(): Promise<Camion[]> {
  const { data, error } = await supabase.from('camiones').select('id, patente, descripcion, capacidad_cilindros, activo').order('patente');
  if (error) throw error;
  return data;
}

export async function guardarCamion(c: Omit<Camion, 'id'> & { id?: string }): Promise<void> {
  const { id, ...fila } = c;
  const r = id ? await supabase.from('camiones').update(fila).eq('id', id) : await supabase.from('camiones').insert(fila);
  if (r.error) throw new Error(mensajeDeError(r.error));
}

// ------------------------------------------------------------------ usuarios

export type Rol = Enum<'rol_usuario'>;
export type Usuario = Pick<Fila<'usuarios'>, 'id' | 'nombre' | 'rol' | 'camion_jornada_id' | 'activo'>;
export interface Cuenta {
  id: string;
  correo: string;
  tiene_perfil: boolean;
  creada_en: string;
  ultimo_ingreso: string | null;
}

export async function listarUsuarios(): Promise<{ usuarios: Usuario[]; cuentas: Cuenta[] }> {
  const [u, c] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, rol, camion_jornada_id, activo').order('nombre'),
    supabase.rpc('cuentas_de_acceso'),
  ]);
  if (u.error) throw u.error;
  if (c.error) throw c.error;
  return { usuarios: u.data, cuentas: c.data };
}

export async function guardarUsuario(u: Usuario, nuevo: boolean): Promise<void> {
  const fila = {
    nombre: u.nombre.trim(),
    rol: u.rol,
    // El camión de la jornada solo tiene sentido para un técnico.
    camion_jornada_id: u.rol === 'tecnico' ? u.camion_jornada_id : null,
    activo: u.activo,
  };
  const r = nuevo
    ? await supabase.from('usuarios').insert({ id: u.id, ...fila })
    : await supabase.from('usuarios').update(fila).eq('id', u.id);
  if (r.error) throw new Error(mensajeDeError(r.error));
}
