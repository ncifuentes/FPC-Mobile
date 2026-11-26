/**
 * Suscripción a los cambios de la tabla movimientos por Supabase Realtime (HU-19).
 *
 * Realtime respeta la RLS: admin y gerente reciben todos los cambios. Varios cambios seguidos
 * (un lote que sincroniza la app) se juntan en un solo aviso, para leer la base una sola vez.
 */
import { supabase } from './supabase';
import { obtenerPerfil } from './sesion';

export type Conexion = 'conectando' | 'en_vivo' | 'sin_conexion';

interface Opciones {
  /** Nombre único del canal en la página. */
  canal: string;
  /** Filtro de Realtime, p. ej. `cilindro_id=eq.<uuid>`. Sin filtro escucha toda la tabla. */
  filtro?: string;
  /** Se llama una vez por ráfaga de cambios. */
  alCambiar: () => void;
  alCambiarConexion?: (estado: Conexion) => void;
  /** Espera para juntar cambios seguidos, en milisegundos. */
  espera?: number;
}

/** Abre la suscripción y devuelve la función que la cierra. */
export function escucharMovimientos({ canal, filtro, alCambiar, alCambiarConexion, espera = 600 }: Opciones): () => void {
  let vigente = true;
  let temporizador: number | undefined;
  let suscripcion: ReturnType<typeof supabase.channel> | null = null;

  void (async () => {
    const perfil = await obtenerPerfil();
    if (!perfil || !vigente) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await supabase.realtime.setAuth(session?.access_token ?? null);
    if (!vigente) return;

    suscripcion = supabase
      .channel(canal)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos', ...(filtro ? { filter: filtro } : {}) }, () => {
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(alCambiar, espera);
      })
      .subscribe((estado) => {
        if (!vigente) return;
        if (estado === 'SUBSCRIBED') alCambiarConexion?.('en_vivo');
        else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') alCambiarConexion?.('sin_conexion');
      });
  })();

  return () => {
    vigente = false;
    window.clearTimeout(temporizador);
    if (suscripcion) void supabase.removeChannel(suscripcion);
  };
}
