import type { Herramienta } from './tipos.ts';
import { aCilindro, argEntero, COLUMNAS_CILINDRO, diaEnChile, diasDesde, leerTodo, promedio } from './comun.ts';

export const rankingClientes: Herramienta = {
  nombre: 'ranking_clientes',
  descripcion:
    'Ranking de los clientes con más cilindros en su poder hoy: cantidad total, arrendables (sin PRO) y ' +
    'días promedio que llevan allá.',
  parametros: {
    type: 'object',
    properties: {
      limite: { type: 'integer', description: 'Cuántos clientes mostrar (1 a 50, por defecto 10).', minimum: 1, maximum: 50 },
    },
  },

  async ejecutar(db, args) {
    const limite = argEntero(args, 'limite', { min: 1, max: 50, defecto: 10 });
    const filas = await leerTodo((desde, hasta) =>
      db.from('cilindros').select(COLUMNAS_CILINDRO).eq('estado', 'en_cliente').order('numero_serie')
        .range(desde, hasta)
    );

    const hoy = diaEnChile();
    const porCliente = new Map<string, { cliente: string; dias: number[]; arrendables: number }>();
    for (const c of filas.map(aCilindro)) {
      const cl = c.sucursal?.cliente;
      if (!cl) continue;
      const r = porCliente.get(cl.id) ?? { cliente: cl.nombre, dias: [], arrendables: 0 };
      r.dias.push(diasDesde(c.en_cliente_desde, hoy) ?? 0);
      if (!c.es_propiedad_cliente) r.arrendables++;
      porCliente.set(cl.id, r);
    }

    const ranking = [...porCliente.entries()]
      .map(([cliente_id, r]) => ({
        cliente_id,
        cliente: r.cliente,
        cilindros: r.dias.length,
        arrendables: r.arrendables,
        dias_promedio: promedio(r.dias),
      }))
      .sort((a, b) => b.cilindros - a.cilindros || a.cliente.localeCompare(b.cliente));

    return {
      fecha_consulta: hoy,
      total_cilindros_en_clientes: filas.length,
      clientes_con_cilindros: ranking.length,
      ranking: ranking.slice(0, limite).map((r, i) => ({ posicion: i + 1, ...r })),
      hay_mas: ranking.length > limite,
    };
  },
};
