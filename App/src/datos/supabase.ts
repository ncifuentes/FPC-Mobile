/**
 * Cliente de Supabase.
 *
 * Es el único lugar del proyecto que crea la conexión. Lo consume
 * `repositorioSupabase.ts` (Sprint 5) y el envío de lotes de
 * `src/sync/sincronizador.tsx`; las pantallas nunca lo importan directo.
 *
 * Las credenciales salen de `.env` (ver `.env.example`). Expo solo inyecta en
 * el bundle las variables con prefijo `EXPO_PUBLIC_`, y las reemplaza como
 * texto al compilar: hay que leerlas como `process.env.EXPO_PUBLIC_X` literal,
 * no con destructuring ni índice dinámico, o quedan `undefined`.
 *
 * La clave es la publicable, pensada para vivir en el teléfono. Quien protege
 * los datos es Row Level Security en Postgres, no el secreto de esta clave.
 */

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `gotrue-js` arma URLs con `URL` y `URLSearchParams`. La implementación de
// React Native no cumple la especificación, así que en nativo se reemplaza. En
// web no: el navegador ya trae la buena y pisarla solo la empeora.
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

const URL_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const CLAVE_SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!URL_SUPABASE || !CLAVE_SUPABASE) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_KEY. ' +
      'Copiar .env.example a .env con los valores del proyecto y reiniciar ' +
      'el bundler con `npx expo start -c`: el caché guarda los valores viejos.',
  );
}

export const supabase: SupabaseClient = createClient(URL_SUPABASE, CLAVE_SUPABASE, {
  auth: {
    // El token vive en el teléfono: el técnico abre la app en la mañana y no
    // vuelve a escribir su clave aunque ande sin señal.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // No hay magic links ni OAuth: nunca llega una sesión en la URL, y en
    // nativo no existe una que leer.
    detectSessionInUrl: false,
  },
});

// Con la app en segundo plano el refresco de token solo gasta batería y datos,
// y si falla deja la sesión en un estado raro. Se reanuda al volver al frente.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
