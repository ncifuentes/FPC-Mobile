/**
 * Implementación en memoria de los repositorios.
 *
 * Sirve para desarrollar y demostrar las pantallas sin base de datos. Reproduce
 * el comportamiento que después dará Postgres:
 *  - el trigger que mantiene `estado`, `clienteActualId` y `enClienteDesde`
 *    derivados del historial de movimientos;
 *  - la idempotencia de `on conflict (uuidLocal) do nothing`.
 *
 * Los datos viven mientras la app esté abierta. La persistencia real de la cola
 * es responsabilidad de `src/sync/colaLocal.ts` (SQLite).
 */

import { ErrorDominio } from '../dominio/repositorios';
import type { Repositorios } from '../dominio/repositorios';
import type {
  Cilindro,
  Cliente,
  Movimiento,
  MovimientoDetallado,
  Usuario,
  Uuid,
} from '../dominio/tipos';
import { CAMIONES, CILINDROS, CLIENTES, USUARIOS } from './datosEjemplo';

function clonar<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Latencia simulada, para que los estados de carga de la interfaz sean visibles. */
function demora<T>(valor: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(valor), ms));
}

export function crearRepositorioMemoria(): Repositorios {
  const clientes: Cliente[] = clonar(CLIENTES);
  const cilindros: Cilindro[] = clonar(CILINDROS);
  const movimientos: Movimiento[] = [];
  let sesion: Usuario | null = null;

  function cilindroPorId(id: Uuid): Cilindro | undefined {
    return cilindros.find((c) => c.id === id);
  }

  function detallar(m: Movimiento): MovimientoDetallado {
    const cilindro = cilindroPorId(m.cilindroId);
    const cliente = m.clienteId ? clientes.find((c) => c.id === m.clienteId) : null;
    const usuario = USUARIOS.find((u) => u.id === m.usuarioId);
    return {
      ...m,
      codigoCilindro: cilindro?.codigo ?? '—',
      nombreCliente: cliente?.nombre ?? null,
      nombreUsuario: usuario?.nombre ?? '—',
    };
  }

  /**
   * Equivalente local del trigger de Postgres: recalcula el estado derivado del
   * cilindro a partir del movimiento recién registrado.
   */
  function aplicarEfecto(m: Movimiento): void {
    const cilindro = cilindroPorId(m.cilindroId);
    if (!cilindro) return;

    if (m.tipo === 'carga') {
      cilindro.estado = 'en_camion';
      cilindro.clienteActualId = null;
      cilindro.enClienteDesde = null;
    } else if (m.tipo === 'entrega') {
      cilindro.estado = 'en_cliente';
      cilindro.clienteActualId = m.clienteId;
      cilindro.enClienteDesde = m.fechaEvento;
    } else {
      cilindro.estado = 'en_camion';
      cilindro.clienteActualId = null;
      cilindro.enClienteDesde = null;
    }
  }

  return {
    auth: {
      async iniciarSesion(usuario, clave) {
        const encontrado = USUARIOS.find(
          (u) => normalizar(u.usuario) === normalizar(usuario),
        );
        // Credencial de desarrollo: cualquier clave no vacía sirve.
        if (!encontrado || clave.trim().length === 0) {
          throw new ErrorDominio('Usuario o contraseña incorrectos.');
        }
        sesion = encontrado;
        return demora(clonar(encontrado), 400);
      },
      async cerrarSesion() {
        sesion = null;
      },
      async sesionActual() {
        return sesion ? clonar(sesion) : null;
      },
    },

    clientes: {
      async listar() {
        return demora(clonar(clientes.filter((c) => c.activo)));
      },
      async buscar(texto) {
        const t = normalizar(texto);
        if (t.length === 0) return demora(clonar(clientes.filter((c) => c.activo)));
        return demora(
          clonar(
            clientes.filter(
              (c) =>
                c.activo &&
                (normalizar(c.nombre).includes(t) || normalizar(c.rut).includes(t)),
            ),
          ),
        );
      },
      async obtener(id) {
        return demora(clonar(clientes.find((c) => c.id === id) ?? null));
      },
    },

    cilindros: {
      async obtenerPorCodigo(codigo) {
        const t = normalizar(codigo);
        return demora(clonar(cilindros.find((c) => normalizar(c.codigo) === t) ?? null));
      },
      async listarPorEstado(estado) {
        return demora(clonar(cilindros.filter((c) => c.estado === estado)));
      },
      async listarEnCamion(camionId) {
        const cargadosHoy = movimientos
          .filter(
            (m) =>
              m.tipo === 'carga' &&
              m.camionId === camionId &&
              mismoDia(new Date(m.fechaEvento), new Date()),
          )
          .map((m) => m.cilindroId);
        return demora(
          clonar(
            cilindros.filter((c) => c.estado === 'en_camion' && cargadosHoy.includes(c.id)),
          ),
        );
      },
      async buscar(texto) {
        const t = normalizar(texto);
        if (t.length === 0) return demora(clonar(cilindros));
        return demora(
          clonar(
            cilindros.filter(
              (c) => normalizar(c.codigo).includes(t) || normalizar(c.tipoGas).includes(t),
            ),
          ),
        );
      },
    },

    camiones: {
      async listar() {
        return demora(clonar(CAMIONES.filter((c) => c.activo)));
      },
      async obtener(id) {
        return demora(clonar(CAMIONES.find((c) => c.id === id) ?? null));
      },
    },

    movimientos: {
      async registrar(movimiento) {
        // Idempotencia: mismo efecto que `on conflict (uuidLocal) do nothing`.
        if (movimientos.some((m) => m.uuidLocal === movimiento.uuidLocal)) return;
        movimientos.push(clonar(movimiento));
        aplicarEfecto(movimiento);
      },
      async listarDelDia(camionId, fecha) {
        return demora(
          movimientos
            .filter((m) => m.camionId === camionId && mismoDia(new Date(m.fechaEvento), fecha))
            .sort((a, b) => b.fechaEvento.localeCompare(a.fechaEvento))
            .map(detallar),
        );
      },
      async listarPorCilindro(cilindroId) {
        return demora(
          movimientos
            .filter((m) => m.cilindroId === cilindroId)
            .sort((a, b) => a.fechaEvento.localeCompare(b.fechaEvento))
            .map(detallar),
        );
      },
      async listarPendientes() {
        return clonar(movimientos.filter((m) => m.fechaSync === null));
      },
      async marcarSincronizados(uuidsLocales, fechaSync) {
        movimientos.forEach((m) => {
          if (uuidsLocales.includes(m.uuidLocal)) m.fechaSync = fechaSync;
        });
      },
    },
  };
}
