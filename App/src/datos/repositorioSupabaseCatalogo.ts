/**
 * Implementación de clientes, sucursales y cilindros sobre Supabase.
 *
 * Vive aparte de `repositorioSupabase.ts` (auth y camiones) porque es la parte
 * que se agrega en este sprint: clientes, sucursales y el parque de cilindros.
 * Los movimientos siguen en memoria hasta la tarea de sincronización: ver
 * `src/datos/index.ts`.
 *
 * Todas las consultas son de solo lectura (`select`): esta tarea no escribe en
 * la base. Clientes y sucursales se filtran por `activo = true`; `cilindros` no
 * tiene esa columna, así que no aplica.
 */

import { ErrorDominio } from '../dominio/repositorios';
import type { RepositorioCilindros, RepositorioClientes, RepositorioSucursales } from '../dominio/repositorios';
import type { Cilindro, Cliente, EstadoCilindro, Sucursal, TipoEnvase, UnidadCapacidad, Uuid } from '../dominio/tipos';
import { supabase } from './supabase';

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/* ------------------------------------------------------------------ clientes */

interface FilaCliente {
  id: string;
  rut: string;
  codigo_kame: string | null;
  nombre: string;
  activo: boolean;
}

const SELECCION_CLIENTE = 'id,rut,codigo_kame,nombre,activo';

function mapearCliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id,
    rut: fila.rut,
    codigoKame: fila.codigo_kame,
    nombre: fila.nombre,
    activo: fila.activo,
  };
}

export function crearRepositorioClientesSupabase(): RepositorioClientes {
  async function listar(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select(SELECCION_CLIENTE)
      .eq('activo', true)
      .order('nombre');
    if (error) {
      console.warn('[repositorioSupabaseCatalogo] clientes.listar falló:', error.message, error.code);
      throw new ErrorDominio('No se pudo cargar la lista de clientes.');
    }
    return (data as FilaCliente[]).map(mapearCliente);
  }

  return {
    listar,
    async buscar(texto) {
      // El catálogo activo es chico (~180 clientes): se descarga completo y se
      // filtra en el teléfono. Así la búsqueda ignora tildes y mayúsculas sin
      // depender de una extensión de Postgres (unaccent) que no está instalada.
      const todos = await listar();
      const t = normalizar(texto);
      if (t.length === 0) return todos;
      return todos.filter(
        (c) =>
          normalizar(c.nombre).includes(t) ||
          normalizar(c.rut).includes(t) ||
          (c.codigoKame != null && normalizar(c.codigoKame).includes(t)),
      );
    },
    async obtener(id) {
      const { data, error } = await supabase
        .from('clientes')
        .select(SELECCION_CLIENTE)
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle<FilaCliente>();
      if (error) {
        console.warn('[repositorioSupabaseCatalogo] clientes.obtener falló:', error.message, error.code);
        throw new ErrorDominio('No se pudo cargar el cliente.');
      }
      return data ? mapearCliente(data) : null;
    },
  };
}

/* ----------------------------------------------------------------- sucursales */

interface FilaSucursal {
  id: string;
  cliente_id: string;
  nombre: string;
  direccion: string;
  comuna: string | null;
  ciudad: string | null;
  region: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  es_principal: boolean;
  activo: boolean;
}

const SELECCION_SUCURSAL =
  'id,cliente_id,nombre,direccion,comuna,ciudad,region,contacto,telefono,email,es_principal,activo';

function mapearSucursal(fila: FilaSucursal): Sucursal {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    nombre: fila.nombre,
    direccion: fila.direccion,
    comuna: fila.comuna,
    ciudad: fila.ciudad,
    region: fila.region,
    contacto: fila.contacto,
    telefono: fila.telefono,
    email: fila.email,
    esPrincipal: fila.es_principal,
    activo: fila.activo,
  };
}

export function crearRepositorioSucursalesSupabase(): RepositorioSucursales {
  return {
    async listarPorCliente(clienteId) {
      const { data, error } = await supabase
        .from('sucursales')
        .select(SELECCION_SUCURSAL)
        .eq('cliente_id', clienteId)
        .eq('activo', true)
        .order('es_principal', { ascending: false })
        .order('nombre');
      if (error) {
        console.warn(
          '[repositorioSupabaseCatalogo] sucursales.listarPorCliente falló:',
          error.message,
          error.code,
        );
        throw new ErrorDominio('No se pudo cargar las sucursales del cliente.');
      }
      return (data as FilaSucursal[]).map(mapearSucursal);
    },
    async obtener(id) {
      const { data, error } = await supabase
        .from('sucursales')
        .select(SELECCION_SUCURSAL)
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle<FilaSucursal>();
      if (error) {
        console.warn('[repositorioSupabaseCatalogo] sucursales.obtener falló:', error.message, error.code);
        throw new ErrorDominio('No se pudo cargar la sucursal.');
      }
      return data ? mapearSucursal(data) : null;
    },
  };
}

/* ------------------------------------------------------------------ cilindros */

interface FilaProducto {
  tipo_envase: TipoEnvase;
  gas_habitual: string | null;
  capacidad: number | null;
  unidad: UnidadCapacidad | null;
}

interface FilaCilindro {
  id: string;
  numero_serie: string;
  codigo_barras: string | null;
  codigo_generado: boolean;
  estado: EstadoCilindro;
  sucursal_actual_id: string | null;
  en_cliente_desde: string | null;
  // PostgREST entrega la relación N:1 como objeto; con algunos tipos generados
  // puede tipar como arreglo de un elemento, por eso se admiten ambas formas.
  producto: FilaProducto | FilaProducto[] | null;
}

const SELECCION_CILINDRO = `
  id,
  numero_serie,
  codigo_barras,
  codigo_generado,
  estado,
  sucursal_actual_id,
  en_cliente_desde,
  producto:productos(tipo_envase,gas_habitual,capacidad,unidad)
`;

function mapearCilindro(fila: FilaCilindro): Cilindro {
  const producto = Array.isArray(fila.producto) ? fila.producto[0] : fila.producto;
  return {
    id: fila.id,
    codigo: fila.codigo_barras ?? fila.numero_serie,
    numeroSerie: fila.numero_serie,
    codigoBarras: fila.codigo_barras,
    tipoEnvase: producto?.tipo_envase ?? 'cilindro',
    tipoGas: producto?.gas_habitual ?? null,
    capacidadValor: producto?.capacidad ?? null,
    capacidadUnidad: producto?.unidad ?? null,
    estado: fila.estado,
    sucursalActualId: fila.sucursal_actual_id,
    enClienteDesde: fila.en_cliente_desde,
    codigoGenerado: fila.codigo_generado,
  };
}

export function crearRepositorioCilindrosSupabase(): RepositorioCilindros {
  async function buscarUno(columna: 'serie_normalizada' | 'codigo_barras', valor: string) {
    const { data, error } = await supabase
      .from('cilindros')
      .select(SELECCION_CILINDRO)
      .eq(columna, valor)
      .maybeSingle<FilaCilindro>();
    if (error) {
      console.warn(
        `[repositorioSupabaseCatalogo] cilindros (${columna}) falló:`,
        error.message,
        error.code,
      );
      throw new ErrorDominio('No se pudo buscar el cilindro.');
    }
    return data;
  }

  return {
    async obtenerPorCodigo(codigo) {
      const texto = codigo.trim();
      if (texto.length === 0) return null;
      // El escáner y el ingreso manual ya normalizan a mayúsculas sin espacios,
      // pero esta función también se llama con el parámetro de ruta de
      // `/cilindro/[codigo]`, que puede llegar con otro formato.
      const serieNormalizada = texto.toUpperCase().replace(/\s+/g, '');
      const porSerie = await buscarUno('serie_normalizada', serieNormalizada);
      if (porSerie) return mapearCilindro(porSerie);
      const porCodigoBarras = await buscarUno('codigo_barras', texto);
      return porCodigoBarras ? mapearCilindro(porCodigoBarras) : null;
    },

    async obtener(id) {
      const { data, error } = await supabase
        .from('cilindros')
        .select(SELECCION_CILINDRO)
        .eq('id', id)
        .maybeSingle<FilaCilindro>();
      if (error) {
        console.warn('[repositorioSupabaseCatalogo] cilindros.obtener falló:', error.message, error.code);
        throw new ErrorDominio('No se pudo cargar el cilindro.');
      }
      return data ? mapearCilindro(data) : null;
    },

    async listarPorEstado(estado) {
      const { data, error } = await supabase
        .from('cilindros')
        .select(SELECCION_CILINDRO)
        .eq('estado', estado)
        .order('numero_serie');
      if (error) {
        console.warn(
          '[repositorioSupabaseCatalogo] cilindros.listarPorEstado falló:',
          error.message,
          error.code,
        );
        throw new ErrorDominio('No se pudo cargar los cilindros.');
      }
      return (data as FilaCilindro[]).map(mapearCilindro);
    },

    async buscar(texto) {
      const t = texto.trim();
      let consulta = supabase.from('cilindros').select(SELECCION_CILINDRO);
      if (t.length > 0) {
        const serieNormalizada = t.toUpperCase().replace(/\s+/g, '');
        consulta = consulta.or(
          `serie_normalizada.ilike.%${serieNormalizada}%,codigo_barras.ilike.%${t}%`,
        );
      }
      // El parque real tiene ~2.200 envases (los datos de ejemplo traían 10):
      // sin límite, una búsqueda vacía bajaría la tabla completa al teléfono
      // en cada apertura de la pantalla de historial.
      const { data, error } = await consulta.order('numero_serie').limit(200);
      if (error) {
        console.warn('[repositorioSupabaseCatalogo] cilindros.buscar falló:', error.message, error.code);
        throw new ErrorDominio('No se pudo buscar cilindros.');
      }
      return (data as FilaCilindro[]).map(mapearCilindro);
    },

    async listarEnCamion(camionId: Uuid) {
      // El esquema no guarda "qué camión trae este cilindro": se deriva del
      // último movimiento de cada envase en estado 'en_camion'. Se resuelve en
      // dos consultas (candidatos + sus movimientos) sin crear vista ni función
      // SQL nueva: evita el N+1 de pedir el último movimiento cilindro por
      // cilindro.
      const { data: candidatos, error } = await supabase
        .from('cilindros')
        .select(SELECCION_CILINDRO)
        .eq('estado', 'en_camion');
      if (error) {
        console.warn(
          '[repositorioSupabaseCatalogo] cilindros.listarEnCamion falló:',
          error.message,
          error.code,
        );
        throw new ErrorDominio('No se pudo cargar los cilindros en el vehículo.');
      }
      const filas = candidatos as FilaCilindro[];
      if (filas.length === 0) return [];

      const ids = filas.map((f) => f.id);
      const { data: movimientos, error: errorMovimientos } = await supabase
        .from('movimientos')
        .select('cilindro_id,tipo,camion_id,fecha_evento,uuid_local')
        .in('cilindro_id', ids)
        .order('fecha_evento', { ascending: false })
        .order('uuid_local', { ascending: false });
      if (errorMovimientos) {
        console.warn(
          '[repositorioSupabaseCatalogo] cilindros.listarEnCamion (movimientos) falló:',
          errorMovimientos.message,
          errorMovimientos.code,
        );
        throw new ErrorDominio('No se pudo cargar los cilindros en el vehículo.');
      }

      // Al venir ordenados de más reciente a más antiguo, el primero que se
      // encuentra para cada cilindro_id es su último movimiento.
      const ultimoPorCilindro = new Map<string, { tipo: string; camion_id: string }>();
      for (const m of (movimientos ?? []) as { cilindro_id: string; tipo: string; camion_id: string }[]) {
        if (!ultimoPorCilindro.has(m.cilindro_id)) {
          ultimoPorCilindro.set(m.cilindro_id, m);
        }
      }

      return filas
        .filter((f) => {
          const ultimo = ultimoPorCilindro.get(f.id);
          return (
            ultimo !== undefined &&
            (ultimo.tipo === 'carga' || ultimo.tipo === 'retiro') &&
            ultimo.camion_id === camionId
          );
        })
        .map(mapearCilindro);
    },
  };
}
