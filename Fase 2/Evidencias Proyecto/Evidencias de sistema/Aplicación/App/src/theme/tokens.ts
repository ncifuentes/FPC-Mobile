/**
 * Tokens de diseño de FPC Mobile.
 *
 * Esta es la ÚNICA fuente de verdad del tema visual y está escrita sin ninguna
 * dependencia de React Native a propósito: la plataforma web de administración
 * (Astro + islas de React) importa este mismo archivo desde su `tailwind.config.js`
 * para generar las clases de Tailwind, de modo que ambos frontends comparten
 * exactamente la misma paleta, los mismos radios y los mismos espacios.
 *
 * Referencia: Arquitectura_Tecnica_FPC_Mobile.md, sección "Stack" (tema Tailwind
 * compartido entre los dos frontends).
 */

export const colores = {
  /** Azul corporativo FPC. El 700 es el color de la barra superior. */
  azul: {
    50: '#EFF6FF',
    100: '#DCEAFB',
    200: '#BBD6F5',
    500: '#1C6FD0',
    600: '#1560BD',
    700: '#0F4C9A',
    800: '#0C3F80',
    900: '#0A3468',
  },
  /** Verde corporativo FPC. Se usa para confirmar y para el estado "Activo". */
  verde: {
    50: '#ECF8F0',
    100: '#D6F0DF',
    500: '#229455',
    600: '#1B7F4B',
    700: '#156138',
  },
  /** Grises de interfaz. */
  gris: {
    0: '#FFFFFF',
    50: '#F4F7FB',
    100: '#EDF2F8',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    700: '#334155',
    900: '#0F172A',
  },
  /** Estados. */
  alerta: '#B45309',
  alertaFondo: '#FEF3C7',
  error: '#B91C1C',
  errorFondo: '#FEE2E2',
} as const;

export const radios = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const espacios = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const tipografia = {
  titulo: { fontSize: 24, fontWeight: '700' },
  subtitulo: { fontSize: 18, fontWeight: '700' },
  cuerpo: { fontSize: 15, fontWeight: '400' },
  cuerpoFuerte: { fontSize: 15, fontWeight: '600' },
  etiqueta: { fontSize: 13, fontWeight: '500' },
  pie: { fontSize: 12, fontWeight: '400' },
} as const;

export const sombras = {
  tarjeta: {
    shadowColor: '#0A3468',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
