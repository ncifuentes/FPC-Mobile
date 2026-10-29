import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { estaCerrandoSesion, obtenerPerfil } from '../lib/sesion';

/**
 * Protege las páginas del panel: si no hay una sesión de admin o gerente, redirige al login.
 * Mientras verifica, el panel queda oculto (ver html[data-sesion='pendiente'] en global.css).
 * No dibuja nada.
 */
export default function GuardiaSesion() {
  useEffect(() => {
    let vigente = true;

    obtenerPerfil()
      .then((perfil) => {
        if (!vigente) return;
        if (perfil) document.documentElement.dataset.sesion = 'ok';
        else window.location.replace('/login');
      })
      .catch(() => {
        if (vigente) window.location.replace('/login');
      });

    // Si la sesión se cierra en otra pestaña o vence, se sale también de esta. Cuando el
    // cierre lo pidió el usuario aquí mismo, cerrarSesion() ya redirige: no se navega dos veces.
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT' && !estaCerrandoSesion()) window.location.replace('/login');
    });

    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
