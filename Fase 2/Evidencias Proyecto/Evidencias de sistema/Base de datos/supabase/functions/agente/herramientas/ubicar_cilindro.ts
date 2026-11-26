import type { Herramienta } from './tipos.ts';
import {
  aCilindro,
  argTexto,
  COLUMNAS_CILINDRO,
  datos,
  diaChileDe,
  diasDesde,
  fechaHoraChile,
  normalizarSerie,
  vieneDeSaldo,
} from './comun.ts';

export const ubicarCilindro: Herramienta = {
  nombre: 'ubicar_cilindro',
  descripcion:
    'Busca un cilindro por su número de serie (ej. B1098) o su código de barras y dice dónde está: ' +
    'estado, cliente y sucursal, desde cuándo y cuántos días, si esa ubicación viene del saldo ' +
    'inicial (carga KAME) y sus últimos movimientos. Si no hay coincidencia exacta, devuelve candidatos.',
  parametros: {
    type: 'object',
    properties: {
      codigo: { type: 'string', description: 'Número de serie o código de barras, tal como lo dijo el usuario.' },
    },
    required: ['codigo'],
  },

  async ejecutar(db, args) {
    const codigo = normalizarSerie(argTexto(args, 'codigo', 60));

    const columnas = `id, codigo_barras, ${COLUMNAS_CILINDRO}`;
    let fila = datos(await db.from('cilindros').select(columnas).eq('serie_normalizada', codigo).maybeSingle());
    if (!fila) {
      fila = datos(await db.from('cilindros').select(columnas).eq('codigo_barras', codigo).maybeSingle());
    }

    if (!fila) {
      // Coincidencia parcial, solo con letras, números y guiones (sin comodines del usuario).
      const parcial = codigo.replace(/[^A-Z0-9-]/g, '');
      const candidatos = parcial.length >= 3
        ? (datos(
          await db.from('cilindros').select('numero_serie').ilike('serie_normalizada', `%${parcial}%`)
            .order('serie_normalizada').limit(6),
        ) as { numero_serie: string }[])
        : [];
      return {
        encontrado: false,
        codigo_buscado: codigo,
        candidatos: candidatos.slice(0, 5).map((c) => c.numero_serie),
        hay_mas_candidatos: candidatos.length > 5,
      };
    }

    const c = aCilindro(fila);
    // deno-lint-ignore no-explicit-any
    const id = (fila as any).id as string;
    const movimientos = datos(
      await db.from('v_movimientos')
        .select('tipo, fecha_evento, cliente_nombre, sucursal_nombre, tecnico_nombre, patente, folio_operacion')
        .eq('cilindro_id', id)
        .order('fecha_evento', { ascending: false })
        .limit(5),
    ) as {
      tipo: string;
      fecha_evento: string;
      cliente_nombre: string | null;
      sucursal_nombre: string | null;
      tecnico_nombre: string | null;
      patente: string | null;
      folio_operacion: number | null;
    }[];

    return {
      encontrado: true,
      numero_serie: c.numero_serie,
      // deno-lint-ignore no-explicit-any
      tiene_codigo_barras: !!(fila as any).codigo_barras,
      producto_codigo: c.producto?.codigo ?? null,
      producto: c.producto?.nombre ?? null,
      es_pro_propiedad_cliente: c.es_propiedad_cliente,
      estado: c.estado,
      cliente: c.sucursal?.cliente?.nombre ?? null,
      sucursal: c.sucursal?.nombre ?? null,
      en_cliente_desde: diaChileDe(c.en_cliente_desde),
      dias_en_cliente: diasDesde(c.en_cliente_desde),
      viene_de_saldo_inicial: vieneDeSaldo(c),
      ultimos_movimientos: movimientos.map((m) => ({
        tipo: m.tipo,
        fecha: fechaHoraChile(m.fecha_evento),
        cliente: m.cliente_nombre,
        sucursal: m.sucursal_nombre,
        tecnico: m.tecnico_nombre,
        patente: m.patente,
        folio: m.folio_operacion,
      })),
    };
  },
};
