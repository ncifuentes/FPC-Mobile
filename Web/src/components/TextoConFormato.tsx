import type { ReactNode } from 'react';

/**
 * Muestra el texto del asistente con formato básico: párrafos, listas, tablas simples, títulos y
 * negrita. Arma elementos de React a partir de un Markdown mínimo; nunca inserta HTML, así que
 * cualquier etiqueta que escriba el modelo se ve como texto.
 */
export default function TextoConFormato({ texto }: { texto: string }) {
  return <div className="flex flex-col gap-3 text-sm leading-relaxed text-gris-900">{bloques(texto)}</div>;
}

const ES_TABLA = /^\s*\|.*\|\s*$/;
const SEPARADOR_TABLA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const ITEM_LISTA = /^\s*(?:[-*•]|\d+[.)])\s+/;

function bloques(texto: string): ReactNode[] {
  const lineas = texto.replace(/\r/g, '').split('\n');
  const salida: ReactNode[] = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    if (!linea.trim()) {
      i++;
      continue;
    }

    // Tabla: fila de encabezado, fila separadora y filas de datos.
    if (ES_TABLA.test(linea) && SEPARADOR_TABLA.test(lineas[i + 1] ?? '')) {
      const encabezado = celdas(linea);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && ES_TABLA.test(lineas[i])) filas.push(celdas(lineas[i++]));
      salida.push(
        <div key={salida.length} className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gris-500">
              <tr>
                {encabezado.map((c, j) => (
                  <th key={j} className="border-b border-gris-200 px-3 py-2 font-medium">
                    {enLinea(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {filas.map((f, j) => (
                <tr key={j}>
                  {encabezado.map((_, k) => (
                    <td key={k} className="px-3 py-1.5 tabular-nums text-gris-700">
                      {enLinea(f[k] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Lista (con viñetas o numerada).
    if (ITEM_LISTA.test(linea)) {
      const numerada = /^\s*\d/.test(linea);
      const items: string[] = [];
      while (i < lineas.length && ITEM_LISTA.test(lineas[i])) items.push(lineas[i++].replace(ITEM_LISTA, ''));
      const Lista = numerada ? 'ol' : 'ul';
      salida.push(
        <Lista key={salida.length} className={`flex flex-col gap-1 pl-5 ${numerada ? 'list-decimal' : 'list-disc'}`}>
          {items.map((t, j) => (
            <li key={j}>{enLinea(t)}</li>
          ))}
        </Lista>,
      );
      continue;
    }

    // Título: se muestra como un párrafo en negrita.
    const titulo = linea.match(/^\s*#{1,6}\s+(.*)$/);
    if (titulo) {
      salida.push(
        <p key={salida.length} className="font-bold">
          {enLinea(titulo[1])}
        </p>,
      );
      i++;
      continue;
    }

    // Párrafo: líneas seguidas hasta una vacía o un bloque de otro tipo.
    const parrafo: string[] = [];
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !ITEM_LISTA.test(lineas[i]) &&
      !/^\s*#{1,6}\s/.test(lineas[i]) &&
      !(ES_TABLA.test(lineas[i]) && SEPARADOR_TABLA.test(lineas[i + 1] ?? ''))
    ) {
      parrafo.push(lineas[i++].trim());
    }
    salida.push(<p key={salida.length}>{enLinea(parrafo.join(' '))}</p>);
  }
  return salida;
}

function celdas(fila: string): string[] {
  return fila.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** Negrita (**texto**) y código (`texto`) dentro de una línea. */
function enLinea(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return partes.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return (
        <code key={i} className="rounded-sm bg-gris-100 px-1 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return p;
  });
}
