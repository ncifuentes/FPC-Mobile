/**
 * Estado de sincronización compartido por toda la app.
 *
 * Responsabilidades:
 *  - registrar movimientos: a la cola local primero, y un intento de envío
 *    oportunista después (si hay señal, sale de inmediato);
 *  - saber cuántos movimientos están pendientes de envío o rechazados (el
 *    técnico tiene que verlo: si no, no sabe que su jornada todavía no llegó);
 *  - reintentar solo: al volver la conexión, al volver la app al frente y,
 *    mientras quede algo pendiente con señal, cada `REINTENTO_MS`;
 *  - mantener al día el respaldo de catálogo para operar sin señal.
 *
 * Solo envía con sesión activa de Supabase y del mismo usuario que registró. El
 * ciclo de envío y folio vive en `procesarCola.ts`; acá solo se adapta a
 * Supabase y a React.
 *
 * Se monta en `app/_layout.tsx` dentro de la sesión; sin usuario autenticado
 * (`usuarioId` null) no envía, no descarga catálogo y no deja registrar.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';

import { repos } from '../datos';
import * as cacheCatalogo from '../datos/cacheCatalogo';
import { fijarEnLinea, hayRed } from '../datos/red';
import { descargarCatalogo } from '../datos/repositorioSupabaseCatalogo';
import { supabase } from '../datos/supabase';
import type { MovimientoNuevo, Uuid } from '../dominio/tipos';
import { colaLocal } from './colaLocal';
import { columnasMovimiento, procesarCola, type ServidorMovimientos } from './procesarCola';

interface EstadoSync {
  /** Por enviar o esperando folio: se reintentan solos. */
  pendientes: number;
  /** Rechazados por el servidor: no se reintentan solos. */
  conError: number;
  enLinea: boolean;
  sincronizando: boolean;
  ultimaSync: Date | null;
  /** Sube cada vez que un ciclo cambió algo: las pantallas lo usan para refrescar. */
  revision: number;
  /** Registra el movimiento: lo deja en la cola local e intenta enviarlo. */
  registrar(movimiento: MovimientoNuevo): Promise<void>;
  /** Fuerza un intento de envío. */
  sincronizar(): Promise<void>;
}

const Contexto = createContext<EstadoSync | null>(null);

/** Con la cola pendiente y señal, cada cuánto se vuelve a intentar. */
const REINTENTO_MS = 60_000;
/** Antigüedad a partir de la cual se vuelve a bajar el catálogo con red. */
const REFRESCO_CATALOGO_MS = 15 * 60_000;

const servidor: ServidorMovimientos = {
  async insertar(lote) {
    const { error, status } = await supabase
      .from('movimientos')
      .upsert(lote.map(columnasMovimiento), { onConflict: 'uuid_local', ignoreDuplicates: true });
    return error ? { message: error.message, code: error.code, status } : null;
  },
  async asignarFolio(uuids) {
    const { error, status } = await supabase.rpc('asignar_folio_despacho', { p_uuids: uuids });
    return error ? { message: error.message, code: error.code, status } : null;
  },
};

async function hayRedSegunSistema(): Promise<boolean> {
  const estado = await Network.getNetworkStateAsync();
  return Boolean(estado.isInternetReachable ?? estado.isConnected);
}

export function ProveedorSync({
  usuarioId,
  children,
}: {
  usuarioId: Uuid | null;
  children: React.ReactNode;
}) {
  const [pendientes, setPendientes] = useState(0);
  const [conError, setConError] = useState(0);
  const [enLinea, setEnLinea] = useState(hayRed());
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const enCurso = useRef(false);
  const descargando = useRef(false);

  const refrescarConteo = useCallback(async () => {
    const conteo = await colaLocal.contar();
    setPendientes(conteo.pendientes);
    setConError(conteo.conError);
  }, []);

  const refrescarCatalogo = useCallback(async () => {
    if (!usuarioId || descargando.current || !hayRed()) return;
    const actual = await cacheCatalogo.leer();
    if (actual && Date.now() - new Date(actual.fecha).getTime() < REFRESCO_CATALOGO_MS) return;
    descargando.current = true;
    try {
      await descargarCatalogo();
    } finally {
      descargando.current = false;
    }
  }, [usuarioId]);

  const sincronizar = useCallback(async () => {
    if (!usuarioId || enCurso.current || !hayRed()) return;
    if ((await colaLocal.contar()).pendientes === 0) return;

    // Sin sesión de Supabase (o de otro usuario) no se intenta: la cola espera.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== usuarioId) return;

    enCurso.current = true;
    setSincronizando(true);
    try {
      const resultado = await procesarCola(colaLocal, servidor, usuarioId);
      // Lo que el servidor ya aceptó se lleva al respaldo de catálogo: sin
      // señal, después de salir de la cola, el envase debe seguir viéndose así.
      await cacheCatalogo.aplicarMovimientos(resultado.insertados);
      if (resultado.insertados.length > 0 || resultado.rechazados > 0 || resultado.folios > 0) {
        setRevision((r) => r + 1);
      }
      if (!resultado.cortadoPorRed) setUltimaSync(new Date());
    } catch (error) {
      // Lo que no alcanzó a procesarse sigue en la cola y se reintenta después.
      if (__DEV__) console.warn('[sync] falló el ciclo de envío', error);
    } finally {
      enCurso.current = false;
      setSincronizando(false);
      await refrescarConteo();
    }
  }, [usuarioId, refrescarConteo]);

  const registrar = useCallback(
    async (movimiento: MovimientoNuevo) => {
      if (!usuarioId) throw new Error('No hay sesión iniciada: no se puede registrar el movimiento.');
      await repos.movimientos.registrar(movimiento);
      await refrescarConteo();
      setRevision((r) => r + 1);
      void sincronizar();
    },
    [usuarioId, refrescarConteo, sincronizar],
  );

  // Al montar y al cambiar de usuario (recién autenticado): conteo, red,
  // envío y catálogo.
  useEffect(() => {
    let vivo = true;
    void refrescarConteo();
    void hayRedSegunSistema().then((conectado) => {
      if (!vivo) return;
      fijarEnLinea(conectado);
      setEnLinea(conectado);
      if (conectado) {
        void sincronizar();
        void refrescarCatalogo();
      }
    });
    return () => {
      vivo = false;
    };
  }, [refrescarConteo, sincronizar, refrescarCatalogo]);

  // Al volver la conexión.
  useEffect(() => {
    const suscripcion = Network.addNetworkStateListener((estado) => {
      const conectado = Boolean(estado.isInternetReachable ?? estado.isConnected);
      fijarEnLinea(conectado);
      setEnLinea(conectado);
      if (conectado) {
        void sincronizar();
        void refrescarCatalogo();
      }
    });
    return () => suscripcion.remove();
  }, [sincronizar, refrescarCatalogo]);

  // Al volver la app al frente: el listener de red no avisa lo que pasó
  // mientras estaba suspendida.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      void hayRedSegunSistema().then((conectado) => {
        fijarEnLinea(conectado);
        setEnLinea(conectado);
        void refrescarConteo();
        if (conectado) {
          void sincronizar();
          void refrescarCatalogo();
        }
      });
    });
    return () => suscripcion.remove();
  }, [refrescarConteo, sincronizar, refrescarCatalogo]);

  // Red "conectada" no garantiza que la primera petición pase (pasa al salir
  // del modo avión): mientras quede algo pendiente, se reintenta cada tanto.
  useEffect(() => {
    if (pendientes === 0 || !enLinea) return;
    const id = setInterval(() => void sincronizar(), REINTENTO_MS);
    return () => clearInterval(id);
  }, [pendientes, enLinea, sincronizar]);

  const valor = useMemo<EstadoSync>(
    () => ({
      pendientes,
      conError,
      enLinea,
      sincronizando,
      ultimaSync,
      revision,
      registrar,
      sincronizar,
    }),
    [pendientes, conError, enLinea, sincronizando, ultimaSync, revision, registrar, sincronizar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSync(): EstadoSync {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSync debe usarse dentro de <ProveedorSync>');
  return valor;
}
