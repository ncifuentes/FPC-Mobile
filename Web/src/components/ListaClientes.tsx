import { useEffect, useMemo, useState } from 'react';
import { cargarCartera, coincide, urlFichaCliente, type ClienteLista } from '../lib/clientes';
import { numero } from '../lib/formato';

const CLAVE_LISTA = 'fpc:lista-clientes';

function inicial() {
  const p = new URLSearchParams(window.location.search);
  return { busqueda: p.get('q') ?? '', soloConCilindros: p.get('con') === '1' };
}

/** Cartera de clientes con búsqueda por nombre, RUT o comuna. Cada fila abre la ficha. */
export default function ListaClientes() {
  const [cartera, setCartera] = useState<ClienteLista[] | null>(null);
  const [error, setError] = useState(false);
  const [{ busqueda, soloConCilindros }, setFiltros] = useState(inicial);

  useEffect(() => {
    cargarCartera()
      .then(setCartera)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (busqueda.trim()) url.searchParams.set('q', busqueda.trim());
    else url.searchParams.delete('q');
    if (soloConCilindros) url.searchParams.set('con', '1');
    else url.searchParams.delete('con');
    window.history.replaceState(null, '', url);
    try {
      sessionStorage.setItem(CLAVE_LISTA, url.pathname + url.search);
    } catch {
      // sin almacenamiento: «volver» lleva al listado completo
    }
  }, [busqueda, soloConCilindros]);

  const visibles = useMemo(
    () =>
      (cartera ?? []).filter(
        (c) => (!soloConCilindros || c.cilindros > 0) && (!busqueda.trim() || coincide(c.buscable, busqueda)),
      ),
    [cartera, busqueda, soloConCilindros],
  );
  const enPoder = useMemo(() => (cartera ?? []).reduce((s, c) => s + c.cilindros, 0), [cartera]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Clientes</h1>
        <p className="mt-1 text-sm text-gris-500">
          {cartera
            ? `${numero.format(cartera.length)} clientes · ${numero.format(enPoder)} cilindros en su poder`
            : 'Cartera de clientes y los cilindros que tiene cada uno.'}
        </p>
      </div>

      <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-gris-200 px-5 py-4 sm:flex-row sm:items-center">
          <label htmlFor="q" className="sr-only">
            Buscar cliente
          </label>
          <input
            id="q"
            type="search"
            autoFocus
            autoComplete="off"
            value={busqueda}
            onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
            placeholder="Buscar por nombre, RUT o comuna…"
            className="min-w-0 flex-1 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900"
          />
          <label className="flex shrink-0 items-center gap-2 text-sm text-gris-700">
            <input
              type="checkbox"
              checked={soloConCilindros}
              onChange={(e) => setFiltros((f) => ({ ...f, soloConCilindros: e.target.checked }))}
              className="size-4 accent-azul-700"
            />
            Solo con cilindros en poder
          </label>
          {busqueda || soloConCilindros ? (
            <button
              type="button"
              onClick={() => setFiltros({ busqueda: '', soloConCilindros: false })}
              className="shrink-0 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-medium text-gris-700 hover:bg-gris-50"
            >
              <span aria-hidden="true">✕</span> Limpiar búsqueda
            </button>
          ) : null}
        </header>

        {error ? (
          <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
            No se pudo cargar la cartera. Revisa tu conexión y recarga la página.
          </p>
        ) : !cartera ? (
          <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
        ) : visibles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gris-500">Ningún cliente coincide con la búsqueda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gris-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">RUT</th>
                  <th className="px-3 py-3 font-medium">Comuna</th>
                  <th className="px-3 py-3 text-right font-medium">Sucursales</th>
                  <th className="px-5 py-3 text-right font-medium">Cilindros en poder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris-100">
                {visibles.map((c) => (
                  <tr key={c.id} className="hover:bg-gris-50">
                    <td className="px-5 py-2.5">
                      <a href={urlFichaCliente(c.id)} className="font-medium text-azul-700 hover:underline">
                        {c.nombre}
                      </a>
                      {!c.activo ? <span className="ml-2 text-xs text-gris-500">inactivo</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gris-700">{c.rut}</td>
                    <td className="px-3 py-2.5 text-gris-700">{c.comuna ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gris-700">{c.sucursales}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {c.cilindros ? (
                        <span className="font-semibold text-gris-900">{numero.format(c.cilindros)}</span>
                      ) : (
                        <span className="text-gris-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cartera && visibles.length > 0 ? (
          <footer className="border-t border-gris-200 px-5 py-3 text-sm text-gris-500">
            {visibles.length === cartera.length
              ? `${numero.format(cartera.length)} clientes`
              : `${numero.format(visibles.length)} de ${numero.format(cartera.length)} clientes`}
          </footer>
        ) : null}
      </section>
    </div>
  );
}

/** Última vista del listado de clientes, para el botón «Volver» de la ficha. */
export function listaClientesReciente(): string {
  try {
    const url = sessionStorage.getItem(CLAVE_LISTA);
    if (url?.startsWith('/clientes')) return url;
  } catch {
    // sin almacenamiento
  }
  return '/clientes';
}
