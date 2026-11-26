/** Clases de Tailwind compartidas por varias pantallas, para que un mismo dato se vea igual en todas. */
import type { Enum } from './database.types';

export const COLOR_TIPO: Record<Enum<'tipo_movimiento'>, string> = {
  carga: 'bg-azul-100 text-azul-700',
  entrega: 'bg-verde-100 text-verde-700',
  retiro: 'bg-alerta-fondo text-alerta',
};

export const COLOR_ESTADO: Record<Enum<'estado_cilindro'>, string> = {
  en_planta: 'bg-gris-100 text-gris-700',
  en_camion: 'bg-azul-100 text-azul-700',
  en_cliente: 'bg-verde-100 text-verde-700',
};
