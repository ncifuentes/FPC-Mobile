import type { Herramienta } from './tipos.ts';
import {
  aCilindro,
  argUuid,
  COLUMNAS_CILINDRO,
  diaChileDe,
  diaEnChile,
  diasDesde,
  leerTodo,
  nombreCliente,
  promedio,
  recortar,
  vieneDeSaldo,
} from './comun.ts';

export const cilindrosDeCliente: Herramienta = {
  nombre: 'cilindros_de_cliente',
  descripcion:
    'Cilindros que un cliente tiene HOY en sus sucursales: total, cuántos se arriendan y cuántos son PRO ' +
    '(propiedad del cliente), desglose por producto y por sucursal, días mínimo/máximo/promedio que llevan ' +
    'allá y la lista de series. Requiere cliente_id (obténlo con buscar_cliente).',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'Identificador del cliente devuelto por buscar_cliente.' },
    },
    required: ['cliente_id'],
  },

  async ejecutar(db, args) {
    const clienteId = argUuid(args, 'cliente_id');
    const cliente = await nombreCliente(db, clienteId);

    const sucursales = await leerTodo<{ id: string }>((desde, hasta) =>
      db.from('sucursales').select('id').eq('cliente_id', clienteId).order('id').range(desde, hasta)
    );
    const filas = sucursales.length
      ? await leerTodo((desde, hasta) =>
        db.from('cilindros').select(COLUMNAS_CILINDRO).eq('estado', 'en_cliente')
          .in('sucursal_actual_id', sucursales.map((s) => s.id))
          .order('en_cliente_desde').order('numero_serie').range(desde, hasta)
      )
      : [];

    const hoy = diaEnChile();
    const cilindros = filas.map(aCilindro).map((c) => ({ c, dias: diasDesde(c.en_cliente_desde, hoy) ?? 0 }));
    const dias = cilindros.map((x) => x.dias);

    const porProducto = new Map<string, { producto_codigo: string; producto: string; cantidad: number; pro: number }>();
    const porSucursal = new Map<string, number>();
    for (const { c } of cilindros) {
      const clave = c.producto?.codigo ?? '?';
      const p = porProducto.get(clave) ??
        { producto_codigo: clave, producto: c.producto?.nombre ?? '?', cantidad: 0, pro: 0 };
      p.cantidad++;
      if (c.es_propiedad_cliente) p.pro++;
      porProducto.set(clave, p);
      const s = c.sucursal?.nombre ?? '?';
      porSucursal.set(s, (porSucursal.get(s) ?? 0) + 1);
    }

    const lista = recortar(cilindros.map(({ c, dias }) => ({
      numero_serie: c.numero_serie,
      producto_codigo: c.producto?.codigo ?? null,
      sucursal: c.sucursal?.nombre ?? null,
      desde: diaChileDe(c.en_cliente_desde),
      dias,
      es_pro: c.es_propiedad_cliente,
      viene_de_saldo_inicial: vieneDeSaldo(c),
    })));

    return {
      cliente,
      fecha_consulta: hoy,
      total_cilindros: cilindros.length,
      arrendables: cilindros.filter((x) => !x.c.es_propiedad_cliente).length,
      pro_propiedad_cliente: cilindros.filter((x) => x.c.es_propiedad_cliente).length,
      desde_saldo_inicial: cilindros.filter((x) => vieneDeSaldo(x.c)).length,
      dias_minimo: dias.length ? Math.min(...dias) : null,
      dias_maximo: dias.length ? Math.max(...dias) : null,
      dias_promedio: promedio(dias),
      por_producto: [...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad),
      por_sucursal: [...porSucursal].map(([sucursal, cantidad]) => ({ sucursal, cantidad })),
      cilindros: lista.filas,
      cilindros_hay_mas: lista.hay_mas,
    };
  },
};
