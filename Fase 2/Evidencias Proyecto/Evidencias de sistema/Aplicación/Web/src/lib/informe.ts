/**
 * Informe de arriendo del mes (HU-23).
 *
 * El cálculo vive en la base: public.informe_envases_arrendados(cliente, desde, hasta, corte).
 * Aquí solo se arman los parámetros y se exporta el resultado. Las reglas, verificadas contra
 * el informe real WESEH0 de KAME (bitácora 27-10):
 *   - el período va de `desde` a `hasta`, ambos incluidos (un mes calendario completo);
 *   - los días se cuentan con fin exclusivo: un envase devuelto el 07 cuenta hasta el 06;
 *   - «envases» son los que siguen en poder del cliente a la fecha de corte;
 *   - la categoría PRO no se arrienda;
 *   - el corte es una foto: lo posterior a esa fecha todavía no ocurrió.
 */
import { supabase } from './supabase';
import { diaEnChile, sumarDias } from './formato';

export interface LineaInforme {
  envase_codigo: string;
  codigo_arriendo: string;
  producto: string;
  envases: number;
  dias: number;
}

export interface Periodo {
  desde: string;
  hasta: string;
  corte: string;
}

/** Mes calendario actual de Chile, como "2026-11". */
export function mesActual(): string {
  return diaEnChile().slice(0, 7);
}

export function esMesValido(mes: string | null): mes is string {
  return !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Primer y último día de un mes "AAAA-MM". */
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const desde = `${mes}-01`;
  const [a, m] = mes.split('-').map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

/**
 * Período de un mes con su corte. Por omisión el corte es hoy si el mes está en curso, o el
 * último día si ya terminó: así el informe del mes en curso muestra «lo devengado hasta hoy».
 */
export function periodoDelMes(mes: string, corte?: string | null): Periodo {
  const { desde, hasta } = limitesDelMes(mes);
  const hoy = diaEnChile();
  const porOmision = hoy >= desde && hoy <= hasta ? hoy : hasta;
  const valido = corte && corte >= desde && corte <= hasta ? corte : porOmision;
  return { desde, hasta, corte: valido };
}

export async function generarInforme(clienteId: string, p: Periodo): Promise<LineaInforme[]> {
  const { data, error } = await supabase.rpc('informe_envases_arrendados', {
    p_cliente_id: clienteId,
    p_desde: p.desde,
    p_hasta: p.hasta,
    p_corte: p.corte,
  });
  if (error) throw new Error(error.message);
  return data;
}

export function totales(lineas: LineaInforme[]): { envases: number; dias: number } {
  return lineas.reduce((t, l) => ({ envases: t.envases + l.envases, dias: t.dias + l.dias }), { envases: 0, dias: 0 });
}

/**
 * CSV para abrir en Excel con configuración regional de Chile: separador punto y coma y BOM
 * para que las tildes se lean bien.
 */
export function informeComoCsv(
  cliente: { nombre: string; rut: string },
  p: Periodo,
  lineas: LineaInforme[],
): string {
  const campo = (v: string | number) => {
    const t = String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas: (string | number)[][] = [
    ['Informe de arriendo de envases'],
    ['Cliente', cliente.nombre],
    ['RUT', cliente.rut],
    ['Período', `${p.desde} a ${p.hasta}`],
    ['Fecha de corte', p.corte],
    [],
    ['Código envase', 'Código arriendo', 'Producto', 'Envases', 'Días'],
    ...lineas.map((l) => [l.envase_codigo, l.codigo_arriendo, l.producto, l.envases, l.dias]),
  ];
  const t = totales(lineas);
  filas.push(['Total', '', '', t.envases, t.dias]);
  return '﻿' + filas.map((f) => f.map(campo).join(';')).join('\r\n') + '\r\n';
}

/** Nombre de archivo sin caracteres raros: "arriendo_2026-10_agricovial-s-a.csv". */
export function nombreArchivo(cliente: string, mes: string): string {
  const base = cliente
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `arriendo_${mes}_${base}.csv`;
}

export function descargar(contenido: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
