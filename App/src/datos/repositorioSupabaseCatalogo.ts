/**
 * Implementación de clientes, sucursales y cilindros sobre Supabase.
 *
 * Vive aparte de `repositorioSupabase.ts` (auth y camiones) porque es la parte
 * que se agrega en este sprint: clientes, sucursales y el parque de cilindros.
 *
 * Todas las consultas son de solo lectura (`select`). Clientes y sucursales se
 * filtran por `activo = true`; `cilindros` no tiene esa columna, así que no aplica.
 *
 * SIN SEÑAL. Cada repositorio exportado consulta Supabase y, si no hay red (o la
 * consulta falla por red), responde desde el respaldo de `cacheCatalogo.ts`,
 * que llena `descargarCatalogo()`. Un error que NO es de red (RLS, columna mal
 * escrita) sigue siendo error: el respaldo no debe esconder un problema real.
 * El estado de los cilindros que sale de acá —servidor o respaldo— es el
 * "crudo": la proyección de la cola local se aplica encima en
 * `repositorioProyectado.ts`.
 */

import { ErrorDominio } from '../dominio/repositorios';
import type { RepositorioCilindros, RepositorioClientes, RepositorioSucursales } from '../dominio/repositorios';
import type { Cilindro, Cliente, EstadoCilindro, Sucursal, TipoEnvase, UnidadCapacidad, Uuid } from '../dominio/tipos';
import * as cacheCatalogo from './cacheCatalogo';
import type { Catalogo } from './cacheCatalogo';
import { esErrorDeRed, hayRed, type ErrorServidor } from './red';
import { supabase } from './supabase';

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function normalizarSerie(texto: string): string {
  return texto.toUpperCase().replace(/\s+/g, '');
}

/** La consulta no obtuvo respuesta: se puede contestar desde el respaldo. */
class ErrorSinRed extends Error {}

function sinRedSi(error: ErrorServidor): void {
  if (esErrorDeRed(error)) throw new ErrorSinRed(error.message);
}

const MENSAJE_SIN_CATALOGO =
  'Sin conexión y sin catálogo descargado en este teléfono. Conéctate a internet ' +
  'una vez con tu sesión iniciada para descargarlo.';

/**
 * Con red, la consulta en línea; sin red (o si se cae por red), el respaldo.
 * Sin red y sin respaldo, un mensaje claro en vez de un error genérico.
 */
async function conRespaldo<T>(enLinea: () => Promise<T>, sinRed: (c: Catalogo) => T): Promise<T> {
  if (hayRed()) {
    try {
      return await enLinea();
    } catch (error) {
      if (!(error instanceof ErrorSinRed)) throw error;
    }
  }
  const catalogo = await cacheCatalogo.leer();
  if (!catalogo) throw new ErrorDominio(MENSAJE_SIN_CATALOGO);
  return sinRed(catalogo);
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

function filtrarClientes(todos: Cliente[], texto: string): Cliente[] {
  const t = normalizar(texto);
  if (t.length === 0) return todos;
  return todos.filter(
    (c) =>
      normalizar(c.nombre).includes(t) ||
      normalizar(c.rut).includes(t) ||
      (c.codigoKame != null && normalizar(c.codigoKame).includes(t)),
  );
}

function clientesEnLinea(): RepositorioClientes {
  async function listar(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select(SELECCION_CLIENTE)
      .eq('activo', true)
      .order('nombre');
    if (error) {
      sinRedSi(error);
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
      return filtrarClientes(await listar(), texto);
    },
    async obtener(id) {
      const { data, error } = await supabase
        .from('clientes')
        .select(SELECCION_CLIENTE)
        .eq('id', id)
        .eq('activo', true)
        .maybeSingle<FilaCliente>();
      if (error) {
        sinRedSi(error);
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

function sucursalesEnLinea(): RepositorioSucursales {
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
        sinRedSi(error);
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
        sinRedSi(error);
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

function cilindrosEnLinea(): RepositorioCilindros {
  async function buscarUno(columna: 'serie_normalizada' | 'codigo_barras', valor: string) {
    const { data, error } = await supabase
      .from('cilindros')
      .select(SELECCION_CILINDRO)
      .eq(columna, valor)
      .maybeSingle<FilaCilindro>();
    if (error) {
      sinRedSi(error);
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
      const serieNormalizada = normalizarSerie(texto);
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
        sinRedSi(error);
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
        sinRedSi(error);
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
        const serieNormalizada = normalizarSerie(t);
        consulta = consulta.or(
          `serie_normalizada.ilike.%${serieNormalizada}%,codigo_barras.ilike.%${t}%`,
        );
      }
      // El parque real tiene ~2.200 envases (los datos de ejemplo traían 10):
      // sin límite, una búsqueda vacía bajaría la tabla completa al teléfono
      // en cada apertura de la pantalla de historial.
      const { data, error } = await consulta.order('numero_serie').limit(200);
      if (error) {
        sinRedSi(error);
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
        sinRedSi(error);
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
        sinRedSi(errorMovimientos);
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

/* ------------------------------------------------- con respaldo sin señal */

export function crearRepositorioClientesSupabase(): RepositorioClientes {
  const enLinea = clientesEnLinea();
  const activos = (c: Catalogo) => c.clientes.filter((x) => x.activo);
  return {
    listar: () => conRespaldo(() => enLinea.listar(), activos),
    buscar: (texto) =>
      conRespaldo(
        () => enLinea.buscar(texto),
        (c) => filtrarClientes(activos(c), texto),
      ),
    obtener: (id) =>
      conRespaldo(
        () => enLinea.obtener(id),
        (c) => activos(c).find((x) => x.id === id) ?? null,
      ),
  };
}

export function crearRepositorioSucursalesSupabase(): RepositorioSucursales {
  const enLinea = sucursalesEnLinea();
  return {
    listarPorCliente: (clienteId) =>
      conRespaldo(
        () => enLinea.listarPorCliente(clienteId),
        (c) =>
          c.sucursales
            .filter((s) => s.clienteId === clienteId && s.activo)
            .sort(
              (a, b) =>
                Number(b.esPrincipal) - Number(a.esPrincipal) || a.nombre.localeCompare(b.nombre),
            ),
      ),
    obtener: (id) =>
      conRespaldo(
        () => enLinea.obtener(id),
        (c) => c.sucursales.find((s) => s.id === id && s.activo) ?? null,
      ),
  };
}

export function crearRepositorioCilindrosSupabase(): RepositorioCilindros {
  const enLinea = cilindrosEnLinea();
  return {
    obtenerPorCodigo: (codigo) =>
      conRespaldo(
        () => enLinea.obtenerPorCodigo(codigo),
        (c) => {
          const texto = codigo.trim();
          if (texto.length === 0) return null;
          const serie = normalizarSerie(texto);
          return (
            c.cilindros.find((x) => normalizarSerie(x.numeroSerie) === serie) ??
            c.cilindros.find((x) => x.codigoBarras === texto) ??
            null
          );
        },
      ),
    obtener: (id) =>
      conRespaldo(
        () => enLinea.obtener(id),
        (c) => c.cilindros.find((x) => x.id === id) ?? null,
      ),
    listarPorEstado: (estado) =>
      conRespaldo(
        () => enLinea.listarPorEstado(estado),
        (c) => c.cilindros.filter((x) => x.estado === estado),
      ),
    // Sin red no se sabe en qué vehículo dejó el servidor cada envase: el
    // respaldo no guarda movimientos. Queda vacío y la proyección agrega lo que
    // se cargó en este teléfono.
    listarEnCamion: (camionId) => conRespaldo(() => enLinea.listarEnCamion(camionId), () => []),
    buscar: (texto) =>
      conRespaldo(
        () => enLinea.buscar(texto),
        (c) => {
          const t = texto.trim();
          const serie = normalizarSerie(t);
          const lista =
            t.length === 0
              ? c.cilindros
              : c.cilindros.filter(
                  (x) =>
                    normalizarSerie(x.numeroSerie).includes(serie) ||
                    (x.codigoBarras !== null &&
                      x.codigoBarras.toLowerCase().includes(t.toLowerCase())),
                );
          return lista
            .slice()
            .sort((a, b) => a.numeroSerie.localeCompare(b.numeroSerie))
            .slice(0, 200);
        },
      ),
  };
}

/* ----------------------------------------------------- descarga de jornada */

// PostgREST corta en 1.000 filas por respuesta (max-rows del proyecto): el
// parque se pide por páginas.
const TAM_PAGINA = 1000;

async function paginado<F>(
  tabla: 'cilindros' | 'clientes' | 'sucursales',
  seleccion: string,
  soloActivos: boolean,
): Promise<F[]> {
  const filas: F[] = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    let consulta = supabase.from(tabla).select(seleccion);
    if (soloActivos) consulta = consulta.eq('activo', true);
    const { data, error } = await consulta.order('id').range(desde, desde + TAM_PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const pagina = (data ?? []) as unknown as F[];
    filas.push(...pagina);
    if (pagina.length < TAM_PAGINA) return filas;
  }
}

/**
 * Baja el catálogo completo y reemplaza el respaldo. Devuelve false si algo
 * falló o vino vacío: en ese caso el respaldo anterior queda intacto.
 */
export async function descargarCatalogo(): Promise<boolean> {
  try {
    const [cilindros, clientes, sucursales] = await Promise.all([
      paginado<FilaCilindro>('cilindros', SELECCION_CILINDRO, false),
      paginado<FilaCliente>('clientes', SELECCION_CLIENTE, true),
      paginado<FilaSucursal>('sucursales', SELECCION_SUCURSAL, true),
    ]);
    return await cacheCatalogo.guardar({
      fecha: new Date().toISOString(),
      cilindros: cilindros.map(mapearCilindro),
      clientes: clientes.map(mapearCliente),
      sucursales: sucursales.map(mapearSucursal),
    });
  } catch (error) {
    if (__DEV__) console.warn('[catalogo] no se pudo descargar el respaldo:', error);
    return false;
  }
}
