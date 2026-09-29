/**
 * Sesión del técnico y vehículo con el que trabaja la jornada.
 *
 * Los permisos reales no viven acá: se resuelven una sola vez con Row Level
 * Security en Postgres (`tecnico` / `admin` / `gerente`). Este contexto solo
 * guarda quién entró y con qué vehículo, para estampar los movimientos.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { repos } from '../datos';
import type { Camion, Usuario } from '../dominio/tipos';

interface EstadoSesion {
  usuario: Usuario | null;
  camion: Camion | null;
  camionesDisponibles: Camion[];
  cargando: boolean;
  iniciarSesion(usuario: string, clave: string): Promise<void>;
  cerrarSesion(): Promise<void>;
  cambiarCamion(camionId: string): Promise<void>;
}

const Contexto = createContext<EstadoSesion | null>(null);

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [camion, setCamion] = useState<Camion | null>(null);
  const [camionesDisponibles, setCamionesDisponibles] = useState<Camion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [sesion, camiones] = await Promise.all([
        repos.auth.sesionActual(),
        repos.camiones.listar(),
      ]);
      if (!vivo) return;
      setCamionesDisponibles(camiones);
      setUsuario(sesion);
      if (sesion?.camionAsignadoId) {
        setCamion(camiones.find((c) => c.id === sesion.camionAsignadoId) ?? null);
      }
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const iniciarSesion = useCallback(
    async (nombreUsuario: string, clave: string) => {
      const sesion = await repos.auth.iniciarSesion(nombreUsuario, clave);
      const camiones = await repos.camiones.listar();
      setCamionesDisponibles(camiones);
      setUsuario(sesion);
      setCamion(
        camiones.find((c) => c.id === sesion.camionAsignadoId) ?? camiones[0] ?? null,
      );
    },
    [],
  );

  const cerrarSesion = useCallback(async () => {
    await repos.auth.cerrarSesion();
    setUsuario(null);
    setCamion(null);
  }, []);

  const cambiarCamion = useCallback(
    async (camionId: string) => {
      setCamion(camionesDisponibles.find((c) => c.id === camionId) ?? null);
    },
    [camionesDisponibles],
  );

  const valor = useMemo<EstadoSesion>(
    () => ({
      usuario,
      camion,
      camionesDisponibles,
      cargando,
      iniciarSesion,
      cerrarSesion,
      cambiarCamion,
    }),
    [usuario, camion, camionesDisponibles, cargando, iniciarSesion, cerrarSesion, cambiarCamion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return valor;
}
