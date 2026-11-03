/**
 * Arma el correo del comprobante de visita a partir de lo que devuelve
 * `datos_comprobante`. Es puro (sin Deno ni red) para poder probarlo en Node:
 * `supabase/pruebas/prueba_comprobante_local.mjs`.
 */

export interface MovimientoComprobante {
  tipo: 'entrega' | 'retiro' | 'carga';
  fecha_evento: string;
  tecnico: string;
  patente: string;
  numero_serie: string;
  codigo_barras: string | null;
  producto: string;
  capacidad: number | null;
  unidad: 'm3' | 'kg' | null;
  gas: string | null;
  es_propiedad_cliente: boolean;
}

export interface DatosComprobante {
  folio: number;
  estado: 'pendiente' | 'enviado' | 'error' | 'sin_correo';
  email_destino: string | null;
  cliente_nombre: string;
  cliente_rut: string;
  sucursal_nombre: string;
  sucursal_direccion: string;
  sucursal_comuna: string | null;
  sucursal_ciudad: string | null;
  movimientos: MovimientoComprobante[];
}

export interface CorreoComprobante {
  asunto: string;
  html: string;
  texto: string;
}

const ZONA = 'America/Santiago';

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

function capacidad(m: MovimientoComprobante): string {
  if (m.capacidad == null || m.unidad == null) return 'Propiedad del cliente';
  return m.unidad === 'm3' ? `${m.capacidad} m³` : `${m.capacidad} kg`;
}

function titulo(movimientos: MovimientoComprobante[]): string {
  const tipos = new Set(movimientos.map((m) => m.tipo));
  if (tipos.has('entrega') && tipos.has('retiro')) return 'Comprobante de entrega y retiro';
  return tipos.has('retiro') ? 'Comprobante de retiro' : 'Comprobante de entrega';
}

const ETIQUETA_TIPO: Record<MovimientoComprobante['tipo'], string> = {
  entrega: 'Entregado',
  retiro: 'Retirado',
  carga: 'Cargado',
};

export function armarComprobante(d: DatosComprobante): CorreoComprobante {
  const movs = d.movimientos ?? [];
  const nombre = titulo(movs);
  const primero = movs[0];
  const lugar = [d.sucursal_direccion, d.sucursal_comuna, d.sucursal_ciudad]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(', ');
  const fecha = primero ? fechaHora(primero.fecha_evento) : '';
  const tecnico = primero?.tecnico ?? '';
  const patente = primero?.patente ?? '';
  const entregados = movs.filter((m) => m.tipo === 'entrega').length;
  const retirados = movs.filter((m) => m.tipo === 'retiro').length;
  const resumen = [
    entregados ? `${entregados} ${entregados === 1 ? 'cilindro entregado' : 'cilindros entregados'}` : '',
    retirados ? `${retirados} ${retirados === 1 ? 'cilindro retirado' : 'cilindros retirados'}` : '',
  ]
    .filter(Boolean)
    .join(' y ');

  const asunto = `${nombre} N° ${d.folio} · ${d.cliente_nombre}`;

  const datos: [string, string][] = [
    ['Folio', String(d.folio)],
    ['Fecha', fecha],
    ['Cliente', `${d.cliente_nombre} (RUT ${d.cliente_rut})`],
    ['Sucursal', d.sucursal_nombre],
    ['Dirección', lugar],
    ['Técnico', tecnico],
    ['Vehículo', patente],
  ];

  const filasDatos = datos
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${escapar(k)}</td>` +
        `<td style="padding:4px 0;color:#111827;font-weight:600">${escapar(v)}</td></tr>`,
    )
    .join('');

  const celda = 'padding:8px;border-bottom:1px solid #e5e7eb;text-align:left';
  const filasCilindros = movs
    .map(
      (m) =>
        `<tr>` +
        `<td style="${celda}">${escapar(ETIQUETA_TIPO[m.tipo])}</td>` +
        `<td style="${celda};font-weight:600">${escapar(m.numero_serie)}</td>` +
        `<td style="${celda}">${escapar(m.producto)}</td>` +
        `<td style="${celda}">${escapar(m.gas ?? '—')}</td>` +
        `<td style="${celda}">${escapar(capacidad(m))}</td>` +
        `</tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#1d4ed8;color:#ffffff;padding:20px 24px">
<div style="font-size:20px;font-weight:700">FPC</div>
<div style="font-size:15px;margin-top:4px">${escapar(nombre)} N° ${d.folio}</div>
</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px;color:#111827;font-size:14px">Este es el comprobante de la visita a su sucursal: ${escapar(resumen || 'sin cilindros')}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:20px">${filasDatos}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
<thead><tr style="background:#f9fafb;color:#374151">
<th style="${celda}">Movimiento</th><th style="${celda}">N° de serie</th><th style="${celda}">Producto</th><th style="${celda}">Gas</th><th style="${celda}">Capacidad</th>
</tr></thead>
<tbody>${filasCilindros}</tbody>
</table>
<p style="margin:20px 0 0;color:#6b7280;font-size:12px">Correo generado automáticamente por FPC Mobile al registrar la visita. Si encuentra una diferencia, responda a este correo indicando el folio.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const texto = [
    `${nombre} N° ${d.folio}`,
    '',
    ...datos.map(([k, v]) => `${k}: ${v}`),
    '',
    'Cilindros:',
    ...movs.map(
      (m) =>
        `- ${ETIQUETA_TIPO[m.tipo]}: ${m.numero_serie} · ${m.producto} · ${m.gas ?? '—'} · ${capacidad(m)}`,
    ),
    '',
    'Correo generado automáticamente por FPC Mobile. Si encuentra una diferencia, responda indicando el folio.',
  ].join('\n');

  return { asunto, html, texto };
}
