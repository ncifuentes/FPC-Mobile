/**
 * Cliente de Supabase de la plataforma web.
 *
 * Un solo cliente para todo el sitio. La sesión se guarda en el navegador (localStorage),
 * así que se mantiene entre páginas y recargas. Lo que cada usuario puede ver o modificar
 * lo deciden las políticas RLS de la base según su rol, no este código.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const clave = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !clave) {
  throw new Error(
    'Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copia web/.env.example como web/.env.',
  );
}

export const supabase = createClient<Database>(url, clave, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
