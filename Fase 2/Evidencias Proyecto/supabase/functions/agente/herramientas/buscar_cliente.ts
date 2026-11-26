import type { Herramienta } from './tipos.ts';
import { argTexto, ErrorHerramienta, leerTodo, sinTildes } from './comun.ts';

interface Cliente {
  id: string;
  nombre: string;
  activo: boolean;
}

export const buscarCliente: Herramienta = {
  nombre: 'buscar_cliente',
  descripcion:
    'Busca clientes por nombre, sin distinguir tildes ni mayúsculas (ej. «viña apaltagua», «cerveceria rural»). ' +
    'Devuelve hasta 10 clientes con su identificador (cliente_id, necesario para las demás herramientas), ' +
    'sus sucursales y cuántos cilindros tienen hoy.',
  parametros: {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'Nombre o parte del nombre del cliente.' },
    },
    required: ['texto'],
  },

  async ejecutar(db, args) {
    const buscado = sinTildes(argTexto(args, 'texto', 80));
    if (buscado.length < 2) throw new ErrorHerramienta('Escribe al menos dos letras del nombre.');
    const palabras = buscado.split(' ');

    const clientes = await leerTodo<Cliente>((desde, hasta) =>
      db.from('clientes').select('id, nombre, activo').order('id').range(desde, hasta)
    );

    // Primero los que contienen todas las palabras; si no hay, los que contienen alguna larga.
    const puntuar = (c: Cliente) => {
      const n = sinTildes(c.nombre);
      if (n === buscado) return 4;
      if (n.startsWith(buscado)) return 3;
      if (n.includes(buscado)) return 2;
      if (palabras.every((p) => n.includes(p))) return 1;
      return 0;
    };
    let coincidencia = 'completa';
    let encontrados = clientes.map((c) => ({ c, p: puntuar(c) })).filter((x) => x.p > 0);
    if (!encontrados.length) {
      const largas = palabras.filter((p) => p.length >= 4);
      encontrados = clientes
        .map((c) => ({ c, p: largas.filter((w) => sinTildes(c.nombre).includes(w)).length }))
        .filter((x) => x.p > 0);
      coincidencia = 'parcial';
    }
    encontrados.sort((a, b) => b.p - a.p || a.c.nombre.localeCompare(b.c.nombre));
    const elegidos = encontrados.slice(0, 10).map((x) => x.c);
    if (!elegidos.length) return { encontrados: 0, clientes: [] };

    const ids = elegidos.map((c) => c.id);
    const sucursales = await leerTodo<{ id: string; nombre: string; cliente_id: string; activo: boolean }>(
      (desde, hasta) =>
        db.from('sucursales').select('id, nombre, cliente_id, activo').in('cliente_id', ids).order('id')
          .range(desde, hasta),
    );
    const cilindros = sucursales.length
      ? await leerTodo<{ sucursal_actual_id: string }>((desde, hasta) =>
        db.from('cilindros').select('sucursal_actual_id').eq('estado', 'en_cliente')
          .in('sucursal_actual_id', sucursales.map((s) => s.id)).order('id').range(desde, hasta)
      )
      : [];
    const porSucursal = new Map<string, number>();
    for (const c of cilindros) porSucursal.set(c.sucursal_actual_id, (porSucursal.get(c.sucursal_actual_id) ?? 0) + 1);

    return {
      encontrados: encontrados.length,
      coincidencia,
      hay_mas: encontrados.length > 10,
      clientes: elegidos.map((c) => {
        const suyas = sucursales.filter((s) => s.cliente_id === c.id);
        return {
          cliente_id: c.id,
          nombre: c.nombre,
          activo: c.activo,
          sucursales: suyas.map((s) => s.nombre),
          cilindros_en_cliente: suyas.reduce((t, s) => t + (porSucursal.get(s.id) ?? 0), 0),
        };
      }),
    };
  },
};
