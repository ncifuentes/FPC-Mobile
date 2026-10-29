/**
 * Tema de Tailwind de la plataforma web.
 *
 * No define colores propios: los toma de App/src/theme/tokens.ts, la única fuente de verdad
 * del tema visual, para que la app móvil y la web compartan exactamente la misma paleta y
 * los mismos radios (decisión del Sprint 2, SB2-01).
 */
import type { Config } from 'tailwindcss';
import { colores, radios } from '../App/src/theme/tokens';

const px = (valor: number) => `${valor}px`;

export default {
  theme: {
    extend: {
      colors: {
        azul: colores.azul,
        verde: colores.verde,
        gris: colores.gris,
        alerta: { DEFAULT: colores.alerta, fondo: colores.alertaFondo },
        error: { DEFAULT: colores.error, fondo: colores.errorFondo },
      },
      borderRadius: {
        sm: px(radios.sm),
        md: px(radios.md),
        lg: px(radios.lg),
        xl: px(radios.xl),
      },
    },
  },
} satisfies Partial<Config>;
