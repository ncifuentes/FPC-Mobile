import type { Herramienta } from './tipos.ts';
import { argEntero, argUuid, datos, diaEnChile, ErrorHerramienta, nombreCliente, sumarDias } from './comun.ts';

interface FilaInforme {
  envase_codigo: string;
  codigo_arriendo: string;
  producto: string;
  envases: number;
  dias: number;
}

export const informeArriendo: Herramienta = {
  nombre: 'informe_arriendo',
  descripcion:
    'Informe de arriendo de un cliente para un mes: por producto, cuántos envases quedan en su poder al ' +
    'cierre y cuántos días de arriendo acumulan (misma regla que el informe de la plataforma y KAME). Si es ' +
    'el mes en curso, se calcula con corte a hoy. NO incluye precios: la base no tiene tarifas. Excluye PRO. ' +
    'Requiere cliente_id (de buscar_cliente).',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'Identificador del cliente devuelto por buscar_cliente.' },
      anio: { type: 'integer', description: 'Año, ej. 2026.', minimum: 2020, maximum: 2100 },
      mes: { type: 'integer', description: 'Mes, 1 a 12.', minimum: 1, maximum: 12 },
    },
    required: ['cliente_id', 'anio', 'mes'],
  },

  async ejecutar(db, args) {
    const clienteId = argUuid(args, 'cliente_id');
    const anio = argEntero(args, 'anio', { min: 2020, max: 2100 });
    const mes = argEntero(args, 'mes', { min: 1, max: 12 });
    const cliente = await nombreCliente(db, clienteId);

    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = sumarDias(mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`, -1);
    const hoy = diaEnChile();
    if (desde > hoy) throw new ErrorHerramienta(`El periodo ${desde} a ${hasta} todavía no comienza.`);
    // Mes en curso: los días posteriores a hoy todavía no ocurren, así que el corte es hoy.
    const corte = hoy < hasta ? hoy : null;

    const filas = datos(
      await db.rpc('informe_envases_arrendados', {
        p_cliente_id: clienteId,
        p_desde: desde,
        p_hasta: hasta,
        p_corte: corte,
      }),
    ) as FilaInforme[];

    return {
      cliente,
      periodo: { desde, hasta },
      corte: corte ?? hasta,
      mes_en_curso: corte !== null,
      por_producto: filas.map((f) => ({
        codigo_arriendo: f.codigo_arriendo,
        producto: f.producto,
        envases_al_cierre: Number(f.envases),
        dias_arriendo: Number(f.dias),
      })),
      total_envases_al_cierre: filas.reduce((t, f) => t + Number(f.envases), 0),
      total_dias_arriendo: filas.reduce((t, f) => t + Number(f.dias), 0),
      nota:
        'Sin montos: la plataforma no maneja tarifas. Los envases PRO (propiedad del cliente) no se arriendan ' +
        'y no aparecen. Los días cuentan con fin exclusivo, como el informe de KAME.',
    };
  },
};
