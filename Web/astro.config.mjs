// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Sitio estático: la sesión y los datos se resuelven en el navegador contra Supabase,
// y la seguridad la imponen las políticas RLS de la base, no el servidor web.
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
