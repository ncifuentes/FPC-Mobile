import { useEffect, useRef, useState } from 'react';
import { buscarCilindros, POR_PAGINA, recordarLista, urlFicha, type Estado, type FilaLista, type FiltrosLista } from '../lib/cilindros';
import { NOMBRE_ESTADO, numero } from '../lib/formato';
import { COLOR_ESTADO } from '../lib/estilos';

const ESTADOS: Estado[] = ['en_planta', 'en_camion', 'en_cliente'];

function filtrosDeLaUrl(): FiltrosLista {
  const p = new URLSearchParams(window.location.search);
  const estado = p.get('estado') as Estado | null;
  const pagina = Number(p.get('pagina') ?? '1');
  return {
    busqueda: p.get('q') ?? '',
    estado: estado && ESTADOS.includes(estado) ? estado : '',
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina - 1 : 0,
  };
}

function guardarEnLaUrl(f: FiltrosLista) {
  const url = new URL(window.location.href);
  const poner = (k: string, v: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  poner('q', f.busqueda.trim());
  poner('estado', f.estado);
  poner('pagina', f.pagina > 0 ? String(f.pagina + 1) : '');
  window.history.replaceState(null, '', url);
  recordarLista(url.pathname + url.search);
}

/** Listado del parque con búsqueda por serie y filtro por estado. Cada fila abre la ficha. */
export default function ListaCilindros() {
  const [filtros, setFiltros] = useState<FiltrosLista>(filtrosDeLaUrl);
  const [resultado, setResultado] = useState<{ filas: FilaLista[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const primeraCarga = useRef(true);

  useEffect(() => {
    guardarEnLaUrl(filtros);
    let vigente = true;
    // La búsqueda espera a que se deje de escribir; los demás cambios se aplican al tiro.
    const espera = window.setTimeout(
      () => {
        buscarCilindros(filtros)
          .then((r) => {
            if (vigente) {
              setResultado(r);
              setError(false);
            }
          })
          .catch(() => vigente && setError(true));
      },
      primeraCarga.current ? 0 : 250,
    );
    primeraCarga.current = false;
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [filtros]);

  const paginas = resultado ? Math.max(1, Math.ceil(resultado.total / POR_PAGINA)) : 1;
  const cambiar = (cambio: Partial<FiltrosLista>) => setFiltros((f) => ({ ...f, pagina: 0, ...cambio }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Cilindros</h1>
        <p className="mt-1 text-sm text-gris-500">Busca un envase por su número de serie para ver dónde está y su historial.</p>
      </div>

      <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-gris-200 px-5 py-4 sm:flex-row sm:items-center">
          <label htmlFor="q" className="sr-only">
            N° de serie
          </label>
          <input
            id="q"
            type="search"
            autoFocus
            autoComplete="off"
            value={filtros.busqueda}
            onChange={(e) => cambiar({ busqueda: e.target.value })}
            onKeyDown={(e) => {
              // Enter con un solo resultado abre la ficha directamente (útil con lector de códigos).
              if (e.key === 'Enter' && resultado?.total === 1) window.location.href = urlFicha(resultado.filas[0].numero_serie);
            }}
            placeholder="Buscar N° de serie…"
            className="min-w-0 flex-1 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900"
          />
          {filtros.busqueda || filtros.estado ? (
            <button
              type="button"
              onClick={() => setFiltros({ busqueda: '', estado: '', pagina: 0 })}
              className="shrink-0 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-medium text-gris-700 hover:bg-gris-50"
            >
              <span aria-hidden="true">✕</span> Limpiar búsqueda
            </button>
          ) : null}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Estado">
            {(['', ...ESTADOS] as const).map((e) => (
              <button
                key={e || 'todos'}
                type="button"
                aria-pressed={filtros.estado === e}
                onClick={() => cambiar({ estado: e })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  filtros.estado === e ? 'bg-azul-700 text-white' : 'bg-gris-100 text-gris-700 hover:bg-gris-200'
                }`}
              >
                {e ? NOMBRE_ESTADO[e] : 'Todos'}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
            No se pudo cargar el listado. Revisa tu conexión y vuelve a intentar.
          </p>
        ) : !resultado ? (
          <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
        ) : resultado.total === 0 ? (
          <p className="px-5 py-8 text-sm text-gris-500">Ningún cilindro coincide con la búsqueda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gris-500">
                <tr>
                  <th className="px-5 py-3 font-medium">N° de serie</th>
                  <th className="px-3 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Depósito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris-100">
                {resultado.filas.map((c) => (
                  <tr key={c.id} className="hover:bg-gris-50">
                    <td className="px-5 py-2.5">
                      <a href={urlFicha(c.numero_serie)} className="font-medium text-azul-700 hover:underline">
                        {c.numero_serie}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-gris-700">
                      {c.productos?.nombre}
                      <span className="ml-2 text-xs text-gris-500">{c.productos?.envase_codigo}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ESTADO[c.estado]}`}>
                        {NOMBRE_ESTADO[c.estado]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gris-700">
                      {c.sucursales?.clientes?.nombre ?? <span className="text-gris-400">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-gris-700">{c.deposito ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultado && resultado.total > 0 ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gris-200 px-5 py-3 text-sm text-gris-500">
            <span>
              {numero.format(filtros.pagina * POR_PAGINA + 1)}–{numero.format(Math.min((filtros.pagina + 1) * POR_PAGINA, resultado.total))} de{' '}
              {numero.format(resultado.total)}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={filtros.pagina === 0}
                onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
                className="rounded-md border border-gris-300 bg-white px-3 py-1.5 font-medium text-gris-700 hover:bg-gris-50 disabled:opacity-40"
              >
                ‹ Anterior
              </button>
              <span className="tabular-nums">
                {filtros.pagina + 1} / {paginas}
              </span>
              <button
                type="button"
                disabled={filtros.pagina + 1 >= paginas}
                onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
                className="rounded-md border border-gris-300 bg-white px-3 py-1.5 font-medium text-gris-700 hover:bg-gris-50 disabled:opacity-40"
              >
                Siguiente ›
              </button>
            </span>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
