/**
 * Implementación en memoria de los movimientos.
 *
 * Clientes, sucursales, cilindros, camiones y auth ya viven en Supabase (ver
 * `src/datos/repositorioSupabase.ts` y `repositorioSupabaseCatalogo.ts`). Los
 * movimientos siguen acá hasta la tarea de sincronización: por ahora
 * `registrar` solo guarda en memoria y es idempotente por `uuidLocal`, igual
 * que hará `on conflict (uuidLocal) do nothing` en Postgres.
 *
 * PENDIENTE (tarea de sincronización): como el cilindro ya no vive en memoria,
 * este repositorio ya no puede simular el trigger de Postgres que recalcula
 * `estado` tras cada movimiento. Mientras `registrar` no inserte de verdad en
 * `public.movimientos`, el estado que devuelve Supabase para un cilindro no
 * refleja los movimientos que el técnico acaba de registrar en esta sesión
 * (por ejemplo: cargarlo y luego intentar entregarlo en el mismo turno puede
 * rechazarse por "no está cargado en el vehículo" aunque la carga ya se
 * registró localmente). Es exactamente el hueco que cierra la tarea siguiente.
 *
 * Para armar `MovimientoDetallado` (nombre de cilindro, cliente, sucursal y
 * usuario) este repositorio recibe los repositorios de catálogo ya resueltos
 * (ver `src/datos/index.ts`) y resuelve el nombre del usuario contra el
 * perfil cacheado de la sesión (`cacheSesion`): todo movimiento registrado acá
 * es siempre del técnico de la sesión actual.
 */

import type {
  RepositorioCilindros,
  RepositorioClientes,
  RepositorioMovimientos,
  RepositorioSucursales,
} from '../dominio/repositorios';
import type { Movimiento, MovimientoDetallado, Uuid } from '../dominio/tipos';
import * as cacheSesion from './cacheSesion';

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface DependenciasRepositorioMovimientos {
  cilindros: Pick<RepositorioCilindros, 'obtener'>;
  sucursales: Pick<RepositorioSucursales, 'obtener'>;
  clientes: Pick<RepositorioClientes, 'obtener'>;
}

export function crearRepositorioMovimientos(
  deps: DependenciasRepositorioMovimientos,
): RepositorioMovimientos {
  const movimientos: Movimiento[] = [];

  async function detallar(m: Movimiento): Promise<MovimientoDetallado> {
    const [cilindro, sucursal, usuarioSesion] = await Promise.all([
      deps.cilindros.obtener(m.cilindroId).catch(() => null),
      m.sucursalId ? deps.sucursales.obtener(m.sucursalId).catch(() => null) : Promise.resolve(null),
      cacheSesion.leerUsuario(),
    ]);
    const cliente = sucursal ? await deps.clientes.obtener(sucursal.clienteId).catch(() => null) : null;

    return {
      ...m,
      codigoCilindro: cilindro?.codigo ?? '—',
      nombreCliente: cliente?.nombre ?? null,
      nombreSucursal: sucursal?.nombre ?? null,
      // Todo movimiento nace en el dispositivo del técnico que inició sesión:
      // no hace falta resolver "qué usuario" contra un listado remoto.
      nombreUsuario: usuarioSesion && usuarioSesion.id === m.usuarioId ? usuarioSesion.nombre : '—',
    };
  }

  return {
    async registrar(movimiento) {
      // Idempotencia: mismo efecto que `on conflict (uuidLocal) do nothing`.
      if (movimientos.some((m) => m.uuidLocal === movimiento.uuidLocal)) return;
      movimientos.push(clonar(movimiento));
    },

    async listarDelDia(camionId: Uuid, fecha: Date) {
      const filtrados = movimientos
        .filter((m) => m.camionId === camionId && mismoDia(new Date(m.fechaEvento), fecha))
        .sort((a, b) => b.fechaEvento.localeCompare(a.fechaEvento));
      return Promise.all(filtrados.map(detallar));
    },

    async listarPorCilindro(cilindroId: Uuid) {
      const filtrados = movimientos
        .filter((m) => m.cilindroId === cilindroId)
        .sort((a, b) => a.fechaEvento.localeCompare(b.fechaEvento));
      return Promise.all(filtrados.map(detallar));
    },

    async listarPendientes() {
      return clonar(movimientos.filter((m) => m.fechaSync === null));
    },

    async marcarSincronizados(uuidsLocales: Uuid[], fechaSync: string) {
      movimientos.forEach((m) => {
        if (uuidsLocales.includes(m.uuidLocal)) m.fechaSync = fechaSync;
      });
    },
  };
}
