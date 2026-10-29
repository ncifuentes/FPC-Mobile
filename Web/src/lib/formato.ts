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

const diaChile = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Desfase de Chile respecto de UTC en un instante dado, como "-03:00" o "-04:00". */
function desfaseChile(instante: Date): string {
  const valor = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' })
    .formatToParts(instante)
    .find((parte) => parte.type === 'timeZoneName')
    ?.value.replace('GMT', '');
  return valor || 'Z';
}

/** Día calendario de Chile para un instante, como "2026-10-29". */
export function diaEnChile(instante = new Date()): string {
  return diaChile.format(instante);
}

/** Suma (o resta) días a un día calendario "AAAA-MM-DD". */
export function sumarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}

/** Días calendario entre dos días "AAAA-MM-DD" (b − a). */
export function diasEntre(a: string, b: string): number {
  const utc = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}

const fechaCorta = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });

/** "28-10-2026" para un instante, en hora de Chile. */
export function formatoFecha(iso: string | null): string {
  return iso ? fechaCorta.format(new Date(iso)) : '—';
}

/** true si el texto es un día calendario válido "AAAA-MM-DD". */
export function esDiaValido(dia: string | null): dia is string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  return sumarDias(dia, 0) === dia;
}

/**
 * Comienzo de un día de Chile como instante ISO con su desfase
 * (p. ej. "2026-10-28T00:00:00-03:00"). El desfase se toma al mediodía de ese día,
 * así un cambio de horario no corre la medianoche.
 */
export function inicioDelDiaEnChile(dia: string): string {
  const mediodia = new Date(`${dia}T12:00:00Z`);
  return `${dia}T00:00:00${desfaseChile(mediodia)}`;
}

/** Rango [desde, hasta) de un día de Chile, para filtrar por fecha_evento. */
export function rangoDelDia(dia: string): { desde: string; hasta: string } {
  return { desde: inicioDelDiaEnChile(dia), hasta: inicioDelDiaEnChile(sumarDias(dia, 1)) };
}

/** Inicio del día de hoy en Chile, para filtrar "lo de hoy" en las consultas. */
export function inicioDeHoyEnChile(ahora = new Date()): string {
  return inicioDelDiaEnChile(diaEnChile(ahora));
}

const diaLargo = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "jueves, 29 de octubre de 2026" para un día "AAAA-MM-DD". */
export function formatoDiaLargo(dia: string): string {
  return diaLargo.format(new Date(`${dia}T12:00:00Z`));
}

/** Duración legible a partir de minutos: "45 min", "2 h 10 min", "1 d 3 h". */
export function formatoDuracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
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
