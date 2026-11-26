/**
 * Sesión del técnico y vehículo con el que trabaja la jornada.
 *
 * Los permisos reales no viven acá: se resuelven una sola vez con Row Level
 * Security en Postgres (`tecnico` / `admin` / `gerente`). Este contexto solo
 * guarda quién entró y con qué vehículo, para estampar los movimientos.
 *
 * El camión lo asigna el administrador en `camion_jornada_id`; la app solo lo
 * lee, por eso no existe ninguna función para cambiarlo desde el teléfono.
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
import { guardarCamion, leerCamion } from '../datos/cacheSesion';
import type { Camion, Usuario } from '../dominio/tipos';

interface EstadoSesion {
  usuario: Usuario | null;
  camion: Camion | null;
  camionesDisponibles: Camion[];
  cargando: boolean;
  iniciarSesion(correo: string, clave: string): Promise<void>;
  cerrarSesion(): Promise<void>;
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
      try {
        // Primero la sesión: sin ella, `camiones` queda vacía por RLS y no
        // tiene sentido ni sirve consultarla. Consultarla igual tumbaba la
        // app antes de llegar al login.
        const sesion = await repos.auth.sesionActual();
        if (!vivo) return;
        if (!sesion) {
          setUsuario(null);
          setCamion(null);
          setCamionesDisponibles([]);
          return;
        }
        setUsuario(sesion);
        await cargarCamionDeSesion(sesion);
      } catch {
        // Cualquier falla acá (red, RLS, lo que sea) no puede tumbar la app
        // antes de mostrar el login: se entra como si no hubiera sesión.
        if (vivo) {
          setUsuario(null);
          setCamion(null);
          setCamionesDisponibles([]);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };

    async function cargarCamionDeSesion(sesion: Usuario) {
      try {
        const camiones = await repos.camiones.listar();
        if (!vivo) return;
        setCamionesDisponibles(camiones);
        const encontrado = camiones.find((c) => c.id === sesion.camionAsignadoId) ?? null;
        setCamion(encontrado);
        await guardarCamion(encontrado);
      } catch {
        // Sesión válida pero sin red para traer la lista: se usa el último
        // camión conocido en vez de dejar al técnico sin vehículo.
        const respaldo = await leerCamion();
        if (!vivo) return;
        setCamionesDisponibles(respaldo ? [respaldo] : []);
        setCamion(respaldo);
      }
    }
  }, []);

  const iniciarSesion = useCallback(
    async (correo: string, clave: string) => {
      const sesion = await repos.auth.iniciarSesion(correo, clave);
      setUsuario(sesion);
      try {
        const camiones = await repos.camiones.listar();
        setCamionesDisponibles(camiones);
        const encontrado = camiones.find((c) => c.id === sesion.camionAsignadoId) ?? null;
        setCamion(encontrado);
        await guardarCamion(encontrado);
      } catch {
        const respaldo = await leerCamion();
        setCamionesDisponibles(respaldo ? [respaldo] : []);
        setCamion(respaldo);
      }
    },
    [],
  );

  const cerrarSesion = useCallback(async () => {
    await repos.auth.cerrarSesion();
    setUsuario(null);
    setCamion(null);
    setCamionesDisponibles([]);
  }, []);

  const valor = useMemo<EstadoSesion>(
    () => ({
      usuario,
      camion,
      camionesDisponibles,
      cargando,
      iniciarSesion,
      cerrarSesion,
    }),
    [usuario, camion, camionesDisponibles, cargando, iniciarSesion, cerrarSesion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): EstadoSesion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return valor;
}
