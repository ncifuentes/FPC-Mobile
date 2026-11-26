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
 *  - mantener al día el respaldo de catálogo para operar sin señal;
 *  - abrir y cerrar las visitas a una sucursal: el folio se pide una vez por
 *    visita, al cerrarla (ver `colaMemoria.ts`).
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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  /** Último ciclo de envío que terminó sin cortarse por red (persiste entre reinicios). */
  ultimaSync: Date | null;
  /** Fecha de la última descarga del respaldo de catálogo. */
  catalogoActualizado: Date | null;
  actualizandoCatalogo: boolean;
  /** Sube cada vez que un ciclo cambió algo: las pantallas lo usan para refrescar. */
  revision: number;
  /** Registra el movimiento: lo deja en la cola local e intenta enviarlo. */
  registrar(movimiento: MovimientoNuevo): Promise<void>;
  /** Abre la visita a una sucursal (idempotente). Va antes del primer `registrar` de la visita. */
  abrirVisita(visita: { despachoId: Uuid; sucursalId: Uuid }): Promise<void>;
  /** Cierra la visita: desde ahí se pide su folio, uno para toda la visita. */
  finalizarVisita(despachoId: Uuid): Promise<void>;
  /** Fuerza un intento de envío. */
  sincronizar(): Promise<void>;
  /** Vuelve a bajar el catálogo aunque esté reciente. `false` si no se pudo. */
  actualizarCatalogo(): Promise<boolean>;
}

const Contexto = createContext<EstadoSync | null>(null);

/** Con la cola pendiente y señal, cada cuánto se vuelve a intentar. */
const REINTENTO_MS = 60_000;
/** Antigüedad a partir de la cual se vuelve a bajar el catálogo con red. */
const REFRESCO_CATALOGO_MS = 15 * 60_000;

/**
 * Último envío, guardado con el usuario: así sobrevive a un reinicio y no se
 * muestra el de otra persona que usó el mismo teléfono.
 */
const CLAVE_ULTIMA_SYNC = 'fpc.sync.ultima';

async function leerUltimaSync(usuarioId: Uuid): Promise<Date | null> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE_ULTIMA_SYNC);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as { usuarioId: Uuid; fecha: string };
    return guardado.usuarioId === usuarioId ? new Date(guardado.fecha) : null;
  } catch {
    return null;
  }
}

async function guardarUltimaSync(usuarioId: Uuid, fecha: Date): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CLAVE_ULTIMA_SYNC,
      JSON.stringify({ usuarioId, fecha: fecha.toISOString() }),
    );
  } catch {
    // Es solo informativo: si no se pudo guardar, se muestra hasta reiniciar.
  }
}

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
  const [catalogoActualizado, setCatalogoActualizado] = useState<Date | null>(null);
  const [actualizandoCatalogo, setActualizandoCatalogo] = useState(false);
  const [revision, setRevision] = useState(0);
  const enCurso = useRef(false);
  const descarga = useRef<Promise<boolean> | null>(null);

  const refrescarConteo = useCallback(async () => {
    const conteo = await colaLocal.contar();
    setPendientes(conteo.pendientes);
    setConError(conteo.conError);
  }, []);

  const refrescarCatalogo = useCallback(
    async (forzar = false): Promise<boolean> => {
      if (!usuarioId || !hayRed()) return false;
      // Si ya hay una revisión o descarga en curso, se espera esa en vez de lanzar otra.
      if (descarga.current) return descarga.current;
      const tarea = (async () => {
        const actual = await cacheCatalogo.leer();
        if (!forzar && actual && Date.now() - new Date(actual.fecha).getTime() < REFRESCO_CATALOGO_MS) {
          return true;
        }
        setActualizandoCatalogo(true);
        try {
          const ok = await descargarCatalogo();
          const nuevo = await cacheCatalogo.leer();
          setCatalogoActualizado(nuevo ? new Date(nuevo.fecha) : null);
          return ok;
        } finally {
          setActualizandoCatalogo(false);
        }
      })();
      descarga.current = tarea;
      try {
        return await tarea;
      } finally {
        descarga.current = null;
      }
    },
    [usuarioId],
  );

  const actualizarCatalogo = useCallback(() => refrescarCatalogo(true), [refrescarCatalogo]);

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
      if (!resultado.cortadoPorRed) {
        const ahora = new Date();
        setUltimaSync(ahora);
        void guardarUltimaSync(usuarioId, ahora);
      }
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

  const abrirVisita = useCallback(
    async (visita: { despachoId: Uuid; sucursalId: Uuid }) => {
      if (!usuarioId) throw new Error('No hay sesión iniciada: no se puede registrar la visita.');
      await colaLocal.abrirDespacho({ ...visita, usuarioId });
    },
    [usuarioId],
  );

  const finalizarVisita = useCallback(
    async (despachoId: Uuid) => {
      await colaLocal.cerrarDespacho(despachoId);
      await refrescarConteo();
      void sincronizar();
    },
    [refrescarConteo, sincronizar],
  );

  // Al montar y al cambiar de usuario (recién autenticado): visitas que
  // quedaron abiertas, conteo, red, envío y catálogo. Una visita abierta a esta
  // altura es de una ejecución anterior (la app se cerró con la pantalla de
  // entrega o retiro abierta): se cierra para que reciba su folio.
  useEffect(() => {
    let vivo = true;
    const cerradas = usuarioId
      ? colaLocal.cerrarDespachosAbiertos(usuarioId).catch(() => undefined)
      : Promise.resolve();
    void cerradas.then(() => refrescarConteo());
    setUltimaSync(null);
    if (usuarioId) {
      // Si un envío terminó antes de leer lo guardado, gana el más reciente.
      void leerUltimaSync(usuarioId).then((fecha) => {
        if (vivo) setUltimaSync((actual) => actual ?? fecha);
      });
    }
    void cacheCatalogo.leer().then((actual) => {
      if (vivo) setCatalogoActualizado(actual ? new Date(actual.fecha) : null);
    });
    void hayRedSegunSistema().then(async (conectado) => {
      await cerradas;
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
  }, [usuarioId, refrescarConteo, sincronizar, refrescarCatalogo]);

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
      catalogoActualizado,
      actualizandoCatalogo,
      revision,
      registrar,
      abrirVisita,
      finalizarVisita,
      sincronizar,
      actualizarCatalogo,
    }),
    [
      pendientes,
      conError,
      enLinea,
      sincronizando,
      ultimaSync,
      catalogoActualizado,
      actualizandoCatalogo,
      revision,
      registrar,
      abrirVisita,
      finalizarVisita,
      sincronizar,
      actualizarCatalogo,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSync(): EstadoSync {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSync debe usarse dentro de <ProveedorSync>');
  return valor;
}
