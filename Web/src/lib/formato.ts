/**
 * Fechas y textos de la interfaz. Toda la operación es en Chile continental, así que las
 * fechas se muestran y se agrupan en America/Santiago, sin importar la zona del navegador.
 */
import type { Enum } from './database.types';

export const ZONA = 'America/Santiago';

const fechaHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const soloHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatoFechaHora(iso: string | null): string {
  return iso ? fechaHora.format(new Date(iso)) : '—';
}

export function formatoHora(iso: string | null): string {
  return iso ? soloHora.format(new Date(iso)) : '—';
}

/**
 * Inicio del día de hoy en Chile, como instante ISO con su desfase (p. ej.
 * "2026-10-28T00:00:00-03:00"), para filtrar "lo de hoy" en las consultas.
 */
export function inicioDeHoyEnChile(ahora = new Date()): string {
  const dia = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  const desfase =
    new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' })
      .formatToParts(ahora)
      .find((parte) => parte.type === 'timeZoneName')
      ?.value.replace('GMT', '') || 'Z';
  return `${dia}T00:00:00${desfase}`;
}

export const NOMBRE_TIPO: Record<Enum<'tipo_movimiento'>, string> = {
  carga: 'Carga',
  entrega: 'Entrega',
  retiro: 'Retiro',
};

export const NOMBRE_ESTADO: Record<Enum<'estado_cilindro'>, string> = {
  en_planta: 'En planta',
  en_camion: 'En camión',
  en_cliente: 'En cliente',
};

export const numero = new Intl.NumberFormat('es-CL');
