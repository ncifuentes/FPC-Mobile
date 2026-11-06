import type { Herramienta } from './tipos.ts';
import { diaEnChile, leerTodo, uno, vieneDeSaldo, aCilindro, COLUMNAS_CILINDRO } from './comun.ts';

export const resumenParque: Herramienta = {
  nombre: 'resumen_parque',
  descripcion:
    'Resumen del parque de cilindros activos: total, cuántos hay en planta, en camión y en clientes, ' +
    'cuántos son PRO, cuántos siguen en la ubicación del saldo inicial y el desglose por producto.',
  parametros: { type: 'object', properties: {} },

  async ejecutar(db) {
    const filas = await leerTodo((desde, hasta) =>
      db.from('cilindros').select(COLUMNAS_CILINDRO).eq('activo', true).order('numero_serie').range(desde, hasta)
    );
    const cilindros = filas.map(aCilindro);

    const porEstado = { en_planta: 0, en_camion: 0, en_cliente: 0 };
    const porProducto = new Map<
      string,
      { producto_codigo: string; producto: string; total: number; en_planta: number; en_camion: number; en_cliente: number }
    >();
    for (const c of cilindros) {
      porEstado[c.estado]++;
      const clave = c.producto?.codigo ?? '?';
      const p = porProducto.get(clave) ??
        { producto_codigo: clave, producto: c.producto?.nombre ?? '?', total: 0, en_planta: 0, en_camion: 0, en_cliente: 0 };
      p.total++;
      p[c.estado]++;
      porProducto.set(clave, p);
    }
    const productos = [...porProducto.values()].sort((a, b) => b.total - a.total);
    const clientes = new Set(cilindros.map((c) => uno(c.sucursal?.cliente)?.id).filter(Boolean));

    return {
      fecha_consulta: diaEnChile(),
      total_activos: cilindros.length,
      por_estado: porEstado,
      pro_propiedad_cliente: cilindros.filter((c) => c.es_propiedad_cliente).length,
      en_cliente_desde_saldo_inicial: cilindros.filter(vieneDeSaldo).length,
      clientes_con_cilindros: clientes.size,
      productos_distintos: productos.length,
      por_producto: productos.slice(0, 30),
      por_producto_hay_mas: productos.length > 30,
    };
  },
};
