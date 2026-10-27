/**
 * Estado de sincronización compartido por toda la app.
 *
 * Responsabilidades:
 *  - saber cuántos movimientos están pendientes de envío (el técnico tiene que
 *    verlo: si no, no sabe que su jornada todavía no llegó al servidor);
 *  - detectar que volvió la conexión y enviar solo, sin que apriete nada.
 *
 * El envío real a Supabase todavía no existe: `enviarLote` es el punto exacto
 * donde entra el `insert ... on conflict (uuid_local) do nothing` del Sprint 5.
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
import * as Network from 'expo-network';

import { repos } from '../datos';
import type { Movimiento } from '../dominio/tipos';
import { colaLocal } from './colaLocal';

interface EstadoSync {
  pendientes: number;
  enLinea: boolean;
  sincronizando: boolean;
  ultimaSync: Date | null;
  /** Registra el movimiento: lo guarda localmente y lo deja en la cola. */
  registrar(movimiento: Movimiento): Promise<void>;
  /** Fuerza un intento de envío. */
  sincronizar(): Promise<void>;
}

const Contexto = createContext<EstadoSync | null>(null);

/**
 * Envío de un lote al servidor.
 *
 * PENDIENTE (Sprint 5): reemplazar por la llamada a Supabase.
 *
 *   await supabase.from('movimientos').upsert(lote, {
 *     onConflict: 'uuid_local',
 *     ignoreDuplicates: true,
 *   });
 *
 * Hoy solo simula el viaje de red para que la interfaz se pueda probar completa.
 */
async function enviarLote(lote: Movimiento[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (__DEV__) {
    console.log(`[sync] lote simulado de ${lote.length} movimiento(s)`);
  }
}

export function ProveedorSync({ children }: { children: React.ReactNode }) {
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const enCurso = useRef(false);

  const refrescarPendientes = useCallback(async () => {
    setPendientes(await colaLocal.contar());
  }, []);

  const sincronizar = useCallback(async () => {
    if (enCurso.current) return;
    const lote = await colaLocal.pendientes();
    if (lote.length === 0) return;

    enCurso.current = true;
    setSincronizando(true);
    try {
      await enviarLote(lote);
      const uuids = lote.map((m) => m.uuidLocal);
      // La hora de referencia la fija el servidor: el reloj del teléfono puede
      // estar mal y de `fechaEvento` depende el cobro de arriendo.
      await repos.movimientos.marcarSincronizados(uuids, new Date().toISOString());
      await colaLocal.confirmarEnviados(uuids);
      setUltimaSync(new Date());
    } catch (error) {
      // Si falla, los movimientos siguen en la cola y se reintenta después.
      if (__DEV__) console.warn('[sync] falló el envío del lote', error);
    } finally {
      enCurso.current = false;
      setSincronizando(false);
      await refrescarPendientes();
    }
  }, [refrescarPendientes]);

  const registrar = useCallback(
    async (movimiento: Movimiento) => {
      await repos.movimientos.registrar(movimiento);
      await colaLocal.encolar(movimiento);
      await refrescarPendientes();
      // Intento oportunista: si hay señal, sale de inmediato.
      void sincronizar();
    },
    [refrescarPendientes, sincronizar],
  );

  useEffect(() => {
    void refrescarPendientes();
  }, [refrescarPendientes]);

  useEffect(() => {
    let vivo = true;
    const suscripcion = Network.addNetworkStateListener((estado) => {
      if (!vivo) return;
      const conectado = Boolean(estado.isInternetReachable ?? estado.isConnected);
      setEnLinea(conectado);
      if (conectado) void sincronizar();
    });

    void Network.getNetworkStateAsync().then((estado) => {
      if (!vivo) return;
      setEnLinea(Boolean(estado.isInternetReachable ?? estado.isConnected));
    });

    return () => {
      vivo = false;
      suscripcion.remove();
    };
  }, [sincronizar]);

  const valor = useMemo<EstadoSync>(
    () => ({ pendientes, enLinea, sincronizando, ultimaSync, registrar, sincronizar }),
    [pendientes, enLinea, sincronizando, ultimaSync, registrar, sincronizar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSync(): EstadoSync {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSync debe usarse dentro de <ProveedorSync>');
  return valor;
}
