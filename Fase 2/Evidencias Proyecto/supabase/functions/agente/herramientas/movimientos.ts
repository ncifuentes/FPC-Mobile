import type { Herramienta } from './tipos.ts';
import {
  argTextoOpcional,
  argUuidOpcional,
  diasEntre,
  ErrorHerramienta,
  esDiaValido,
  fechaHoraChile,
  inicioDelDiaEnChile,
  leerTodo,
  recortar,
  sinTildes,
  sumarDias,
} from './comun.ts';

const TIPOS = ['carga', 'entrega', 'retiro'];

interface Fila {
  tipo: string;
  fecha_evento: string;
  numero_serie: string;
  producto_nombre: string;
  cliente_nombre: string | null;
  sucursal_nombre: string | null;
  tecnico_nombre: string;
  patente: string;
  folio_operacion: number | null;
}

export const movimientos: Herramienta = {
  nombre: 'movimientos',
  descripcion:
    'Movimientos registrados por los técnicos (carga, entrega, retiro) entre dos días de Chile, ambos ' +
    'inclusive. Devuelve un resumen por tipo, por técnico y por cliente, y hasta 50 movimientos. Filtros ' +
    'opcionales: tipo, nombre del técnico (sin tildes ni mayúsculas) y cliente_id.',
  parametros: {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'Primer día, AAAA-MM-DD (hora de Chile).' },
      hasta: { type: 'string', description: 'Último día, AAAA-MM-DD, inclusive. Si falta, igual a desde.' },
      tipo: { type: 'string', description: 'Tipo de movimiento.', enum: TIPOS },
      tecnico: { type: 'string', description: 'Nombre o parte del nombre del técnico.' },
      cliente_id: { type: 'string', description: 'Identificador del cliente (de buscar_cliente).' },
    },
    required: ['desde'],
  },

  async ejecutar(db, args) {
    const desde = args.desde;
    const hasta = args.hasta === undefined || args.hasta === null || args.hasta === '' ? desde : args.hasta;
    if (!esDiaValido(desde) || !esDiaValido(hasta)) throw new ErrorHerramienta('Las fechas deben ser AAAA-MM-DD.');
    if (hasta < desde) throw new ErrorHerramienta('«hasta» no puede ser anterior a «desde».');
    if (diasEntre(desde, hasta) > 92) throw new ErrorHerramienta('El rango máximo es de 93 días.');

    const tipo = argTextoOpcional(args, 'tipo', 20);
    if (tipo && !TIPOS.includes(tipo)) throw new ErrorHerramienta('«tipo» debe ser carga, entrega o retiro.');
    const tecnico = argTextoOpcional(args, 'tecnico', 80);
    const clienteId = argUuidOpcional(args, 'cliente_id');

    const todas = await leerTodo<Fila>((d, h) => {
      let q = db.from('v_movimientos')
        .select(
          'tipo, fecha_evento, numero_serie, producto_nombre, cliente_nombre, sucursal_nombre, tecnico_nombre, patente, folio_operacion',
        )
        .gte('fecha_evento', inicioDelDiaEnChile(desde))
        .lt('fecha_evento', inicioDelDiaEnChile(sumarDias(hasta, 1)));
      if (tipo) q = q.eq('tipo', tipo);
      if (clienteId) q = q.eq('cliente_id', clienteId);
      return q.order('fecha_evento', { ascending: false }).order('uuid_local').range(d, h);
    });

    const tecnicosDelPeriodo = [...new Set(todas.map((m) => m.tecnico_nombre))].sort();
    const buscado = tecnico ? sinTildes(tecnico) : null;
    const filas = buscado ? todas.filter((m) => sinTildes(m.tecnico_nombre).includes(buscado)) : todas;

    const contar = (clave: (m: Fila) => string) => {
      const mapa = new Map<string, Record<string, number>>();
      for (const m of filas) {
        const k = clave(m);
        const r = mapa.get(k) ?? { carga: 0, entrega: 0, retiro: 0, total: 0 };
        r[m.tipo]++;
        r.total++;
        mapa.set(k, r);
      }
      return [...mapa]
        .map(([nombre, r]) => ({ nombre, carga: r.carga, entrega: r.entrega, retiro: r.retiro, total: r.total }))
        .sort((a, b) => b.total - a.total);
    };

    const porTipo = { carga: 0, entrega: 0, retiro: 0 } as Record<string, number>;
    for (const m of filas) porTipo[m.tipo]++;

    const lista = recortar(filas.map((m) => ({
      fecha: fechaHoraChile(m.fecha_evento),
      tipo: m.tipo,
      numero_serie: m.numero_serie,
      producto: m.producto_nombre,
      cliente: m.cliente_nombre,
      sucursal: m.sucursal_nombre,
      tecnico: m.tecnico_nombre,
      patente: m.patente,
      folio: m.folio_operacion,
    })));

    return {
      periodo: { desde, hasta },
      filtros: { tipo, tecnico, cliente_id: clienteId },
      total: filas.length,
      por_tipo: porTipo,
      por_tecnico: contar((m) => m.tecnico_nombre),
      por_cliente: contar((m) => m.cliente_nombre ?? '(carga en planta)'),
      folios_distintos: new Set(filas.map((m) => m.folio_operacion).filter((f) => f !== null)).size,
      tecnicos_con_movimientos_en_el_periodo: tecnicosDelPeriodo,
      movimientos: lista.filas,
      hay_mas: lista.hay_mas,
    };
  },
};
