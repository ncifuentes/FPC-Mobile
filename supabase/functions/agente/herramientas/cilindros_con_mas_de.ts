import type { Herramienta } from './tipos.ts';
import {
  aCilindro,
  argEntero,
  COLUMNAS_CILINDRO,
  datos,
  diaChileDe,
  diaEnChile,
  diasDesde,
  inicioDelDiaEnChile,
  sumarDias,
  vieneDeSaldo,
} from './comun.ts';

export const cilindrosConMasDe: Herramienta = {
  nombre: 'cilindros_con_mas_de',
  descripcion:
    'Cilindros que llevan MÁS de N días en un cliente (días calendario de Chile hasta hoy), del más antiguo ' +
    'al más reciente: total y lista con cliente, sucursal, producto y días.',
  parametros: {
    type: 'object',
    properties: {
      dias: { type: 'integer', description: 'Umbral de días (estrictamente más de).', minimum: 0, maximum: 3650 },
      limite: { type: 'integer', description: 'Máximo de cilindros a listar (1 a 50, por defecto 50).', minimum: 1, maximum: 50 },
    },
    required: ['dias'],
  },

  async ejecutar(db, args) {
    const dias = argEntero(args, 'dias', { min: 0, max: 3650 });
    const limite = argEntero(args, 'limite', { min: 1, max: 50, defecto: 50 });
    const hoy = diaEnChile();
    // Más de N días  <=>  el día de llegada es anterior a hoy − N.
    const umbral = inicioDelDiaEnChile(sumarDias(hoy, -dias));

    const r = await db.from('cilindros')
      .select(COLUMNAS_CILINDRO, { count: 'exact' })
      .eq('estado', 'en_cliente')
      .lt('en_cliente_desde', umbral)
      .order('en_cliente_desde')
      .order('numero_serie')
      .limit(limite);
    const filas = datos(r) ?? [];
    const total = r.count ?? filas.length;

    return {
      fecha_consulta: hoy,
      umbral_dias: dias,
      total,
      cilindros: filas.map(aCilindro).map((c) => ({
        numero_serie: c.numero_serie,
        producto_codigo: c.producto?.codigo ?? null,
        cliente: c.sucursal?.cliente?.nombre ?? null,
        sucursal: c.sucursal?.nombre ?? null,
        desde: diaChileDe(c.en_cliente_desde),
        dias: diasDesde(c.en_cliente_desde, hoy),
        es_pro: c.es_propiedad_cliente,
        viene_de_saldo_inicial: vieneDeSaldo(c),
      })),
      hay_mas: total > filas.length,
    };
  },
};
