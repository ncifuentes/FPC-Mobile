/**
 * Movimientos: lo sincronizado se lee del servidor y lo pendiente de la cola.
 *
 * Reemplaza al repositorio en memoria. Ya no hay una segunda copia local de los
 * movimientos: la única fuente local es la cola (`src/sync/colaLocal.ts`, SQLite
 * en el teléfono y memoria en web), y lo que ya llegó se lee de `v_movimientos`,
 * que trae cilindro, cliente, sucursal y técnico unidos y respeta RLS
 * (`security_invoker`).
 *
 * LIMITACIÓN CONOCIDA (RLS, a propósito): el técnico solo ve sus propios
 * movimientos. El historial de un cilindro, para un técnico, muestra solo lo
 * que él registró, no lo que hizo otro técnico ni la administración. No se
 * parchea desde la app.
 */

import type { RepositorioMovimientos } from '../dominio/repositorios';
import type {
  EnvioMovimiento,
  MovimientoDetallado,
  OrigenCodigo,
  TipoMovimiento,
} from '../dominio/tipos';
import type { ColaLocal, MovimientoEnCola } from '../sync/colaMemoria';
import * as cacheSesion from './cacheSesion';
import { combinarHistorial } from './proyeccion';
import { hayRed } from './red';
import { supabase } from './supabase';

interface FilaVista {
  uuid_local: string;
  tipo: TipoMovimiento;
  cilindro_id: string;
  sucursal_id: string | null;
  usuario_id: string;
  camion_id: string;
  fecha_evento: string;
  fecha_sync: string;
  codigo_origen: OrigenCodigo;
  numero_serie: string;
  codigo_barras: string | null;
  cliente_nombre: string | null;
  sucursal_nombre: string | null;
  tecnico_nombre: string;
}

const SELECCION_VISTA =
  'uuid_local,tipo,cilindro_id,sucursal_id,usuario_id,camion_id,fecha_evento,fecha_sync,' +
  'codigo_origen,numero_serie,codigo_barras,cliente_nombre,sucursal_nombre,tecnico_nombre';

function desdeVista(f: FilaVista): MovimientoDetallado {
  return {
    uuidLocal: f.uuid_local,
    tipo: f.tipo,
    cilindroId: f.cilindro_id,
    sucursalId: f.sucursal_id,
    usuarioId: f.usuario_id,
    camionId: f.camion_id,
    fechaEvento: f.fecha_evento,
    fechaSync: f.fecha_sync,
    origenCodigo: f.codigo_origen,
    codigoCilindro: f.codigo_barras ?? f.numero_serie,
    nombreCliente: f.cliente_nombre,
    nombreSucursal: f.sucursal_nombre,
    nombreUsuario: f.tecnico_nombre,
    envio: 'enviado',
    errorEnvio: null,
  };
}

function envioDeCola(m: MovimientoEnCola): EnvioMovimiento {
  if (m.estadoEnvio === 'rechazado') return 'rechazado';
  // `sin_folio` ya llegó: solo falta el número de despacho.
  return m.estadoEnvio === 'sin_folio' ? 'enviado' : 'pendiente';
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function crearRepositorioMovimientos(cola: ColaLocal): RepositorioMovimientos {
  async function locales(filtro: (m: MovimientoEnCola) => boolean): Promise<MovimientoDetallado[]> {
    const usuario = await cacheSesion.leerUsuario();
    return (await cola.listar()).filter(filtro).map((m) => ({
      uuidLocal: m.uuidLocal,
      tipo: m.tipo,
      cilindroId: m.cilindroId,
      sucursalId: m.sucursalId,
      usuarioId: m.usuarioId,
      camionId: m.camionId,
      fechaEvento: m.fechaEvento,
      fechaSync: null,
      origenCodigo: m.origenCodigo,
      codigoCilindro: m.codigoCilindro,
      nombreCliente: m.nombreCliente,
      nombreSucursal: m.nombreSucursal,
      nombreUsuario: usuario && usuario.id === m.usuarioId ? usuario.nombre : '—',
      envio: envioDeCola(m),
      errorEnvio: m.errorEnvio,
    }));
  }

  /** null si no se pudo consultar el servidor (sin red o error). */
  async function delServidor(
    filtrar: (consulta: ReturnType<typeof consultaBase>) => ReturnType<typeof consultaBase>,
  ): Promise<MovimientoDetallado[] | null> {
    if (!hayRed()) return null;
    const { data, error } = await filtrar(consultaBase());
    if (error) {
      if (__DEV__) console.warn('[repositorioMovimientos] v_movimientos falló:', error.message, error.code);
      return null;
    }
    return (data as unknown as FilaVista[]).map(desdeVista);
  }

  return {
    async registrar(movimiento) {
      await cola.encolar(movimiento);
    },

    async listarDelDia(camionId, fecha) {
      const desde = inicioDelDia(fecha);
      const hasta = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + 1);
      const enRango = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= desde.getTime() && t < hasta.getTime();
      };
      const [servidor, enCola] = await Promise.all([
        delServidor((q) =>
          q
            .eq('camion_id', camionId)
            .gte('fecha_evento', desde.toISOString())
            .lt('fecha_evento', hasta.toISOString()),
        ),
        locales((m) => m.camionId === camionId && enRango(m.fechaEvento)),
      ]);
      // La pantalla lista del más reciente al más antiguo.
      return {
        movimientos: combinarHistorial(servidor ?? [], enCola).reverse(),
        incompleto: servidor === null,
      };
    },

    async listarPorCilindro(cilindroId) {
      const [servidor, enCola] = await Promise.all([
        delServidor((q) => q.eq('cilindro_id', cilindroId)),
        locales((m) => m.cilindroId === cilindroId),
      ]);
      return { movimientos: combinarHistorial(servidor ?? [], enCola), incompleto: servidor === null };
    },

    async listarPendientes() {
      return (await cola.listar()).filter((m) => m.estadoEnvio === 'pendiente');
    },
  };
}

function consultaBase() {
  return supabase.from('v_movimientos').select(SELECCION_VISTA).order('fecha_evento');
}
