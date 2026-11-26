import { useEffect, useState } from 'react';
import { cargarCartera, urlFichaCliente, type ClienteLista } from '../lib/clientes';
import {
  descargar,
  esMesValido,
  generarInforme,
  informeComoCsv,
  mesActual,
  nombreArchivo,
  periodoDelMes,
  totales,
  type LineaInforme,
  type Periodo,
} from '../lib/informe';
import { esDiaValido, formatoDiaLargo, numero } from '../lib/formato';
import SelectorCliente from './SelectorCliente';

type Resultado =
  | { estado: 'vacio' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; lineas: LineaInforme[]; periodo: Periodo; generado: Date };

function parametrosIniciales() {
  const p = new URLSearchParams(window.location.search);
  const mes = p.get('mes');
  const corte = p.get('corte');
  return {
    clienteId: p.get('cliente'),
    mes: esMesValido(mes) ? mes : mesActual(),
    corte: esDiaValido(corte) ? corte : null,
  };
}

const fechaCorta = (dia: string) => dia.split('-').reverse().join('-');

const MESES_ATRAS = 24;
const formatoMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "Octubre de 2026" para "2026-10". */
function nombreDelMes(mes: string): string {
  const t = formatoMes.format(new Date(`${mes}-15T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** El mes actual y los 24 anteriores (más el elegido, si viene de la URL y es más antiguo). */
function opcionesDeMes(elegido: string): string[] {
  const meses: string[] = [];
  let [a, m] = mesActual().split('-').map(Number);
  for (let i = 0; i <= MESES_ATRAS; i++) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      a -= 1;
    }
  }
  if (!meses.includes(elegido)) meses.push(elegido);
  return meses;
}

/**
 * Informe de arriendo del mes (HU-23): envases que el cliente retiene y días de arriendo por
 * tipo de envase, listo para trasladar a la facturación en KAME. No calcula montos.
 */
export default function InformeArriendo() {
  const [inicio] = useState(parametrosIniciales);
  const [cartera, setCartera] = useState<ClienteLista[] | null>(null);
  const [errorCartera, setErrorCartera] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(inicio.clienteId);
  const [mes, setMes] = useState(inicio.mes);
  const [corte, setCorte] = useState<string | null>(inicio.corte);
  const [resultado, setResultado] = useState<Resultado>({ estado: 'vacio' });

  const periodo = periodoDelMes(mes, corte);
  const cliente = cartera?.find((c) => c.id === clienteId) ?? null;

  useEffect(() => {
    cargarCartera()
      .then(setCartera)
      .catch(() => setErrorCartera(true));
  }, []);

  // Cada cambio de cliente o período vuelve a generar el informe y queda en la URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const poner = (k: string, v: string | null) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    poner('cliente', clienteId);
    poner('mes', mes);
    poner('corte', corte);
    window.history.replaceState(null, '', url);

    if (!clienteId) {
      setResultado({ estado: 'vacio' });
      return;
    }
    let vigente = true;
    setResultado({ estado: 'cargando' });
    const p = periodoDelMes(mes, corte);
    generarInforme(clienteId, p)
      .then((lineas) => vigente && setResultado({ estado: 'listo', lineas, periodo: p, generado: new Date() }))
      .catch((e: Error) => vigente && setResultado({ estado: 'error', mensaje: e.message }));
    return () => {
      vigente = false;
    };
  }, [clienteId, mes, corte]);

  const t = resultado.estado === 'listo' ? totales(resultado.lineas) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-gris-900">Informe de arriendo del mes</h1>
        <p className="mt-1 text-sm text-gris-500">
          Envases que retiene el cliente y días de arriendo por tipo de envase, para trasladar a la facturación.
        </p>
      </div>

      {/* Parámetros */}
      <section className="grid gap-4 rounded-lg border border-gris-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] print:hidden">
        <div>
          <label htmlFor="cliente" className="mb-1 block text-xs font-medium text-gris-500">
            Cliente
          </label>
          {errorCartera ? (
            <p className="text-sm text-error">No se pudo cargar la lista de clientes.</p>
          ) : cartera ? (
            <SelectorCliente clientes={cartera} valor={clienteId} onElegir={setClienteId} />
          ) : (
            <p className="py-2 text-sm text-gris-500">Cargando clientes…</p>
          )}
        </div>
        <div>
          <label htmlFor="mes" className="mb-1 block text-xs font-medium text-gris-500">
            Mes
          </label>
          <select
            id="mes"
            value={mes}
            onChange={(e) => {
              setMes(e.target.value);
              setCorte(null);
            }}
            className="w-full rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900 first-letter:uppercase"
          >
            {opcionesDeMes(mes).map((m) => (
              <option key={m} value={m}>
                {nombreDelMes(m)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gris-500">
            Del {fechaCorta(periodo.desde)} al {fechaCorta(periodo.hasta)}
          </p>
        </div>
        <div>
          <label htmlFor="corte" className="mb-1 block text-xs font-medium text-gris-500">
            Fecha de corte
          </label>
          <input
            id="corte"
            type="date"
            value={periodo.corte}
            min={periodo.desde}
            max={periodo.hasta}
            onChange={(e) => setCorte(esDiaValido(e.target.value) ? e.target.value : null)}
            className="w-full rounded-md border border-gris-300 bg-white px-3 py-2 text-sm tabular-nums text-gris-900"
          />
          <p className="mt-1 text-xs text-gris-500">El informe muestra la situación a esta fecha.</p>
        </div>
      </section>

      {/* Resultado */}
      {resultado.estado === 'vacio' ? (
        <p className="rounded-lg border border-dashed border-gris-300 p-6 text-sm text-gris-500 print:hidden">
          Elige un cliente para generar su informe.
        </p>
      ) : resultado.estado === 'cargando' ? (
        <p className="text-sm text-gris-500">Generando informe…</p>
      ) : resultado.estado === 'error' ? (
        <p role="alert" className="rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudo generar el informe: {resultado.mensaje}
        </p>
      ) : (
        <section className="rounded-lg border border-gris-200 bg-white shadow-sm print:border-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gris-200 px-5 py-4">
            <div>
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-gris-500 print:block">
                FPC Servicios · Informe de arriendo de envases
              </p>
              <h2 className="text-lg font-bold text-gris-900">{cliente?.nombre ?? 'Cliente'}</h2>
              <p className="text-sm text-gris-500">
                RUT {cliente?.rut ?? '—'} · {fechaCorta(resultado.periodo.desde)} al {fechaCorta(resultado.periodo.hasta)}
                {resultado.periodo.corte !== resultado.periodo.hasta ? ` · corte al ${fechaCorta(resultado.periodo.corte)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              {cliente ? (
                <a
                  href={urlFichaCliente(cliente.id)}
                  className="rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-medium text-gris-700 hover:bg-gris-50"
                >
                  Ver ficha del cliente
                </a>
              ) : null}
              <button
                type="button"
                disabled={resultado.lineas.length === 0}
                onClick={() =>
                  cliente &&
                  descargar(informeComoCsv(cliente, resultado.periodo, resultado.lineas), nombreArchivo(cliente.nombre, mes))
                }
                className="rounded-md border border-azul-700 bg-white px-3 py-2 text-sm font-semibold text-azul-700 hover:bg-azul-50 disabled:opacity-40"
              >
                Descargar Excel (CSV)
              </button>
              <button
                type="button"
                disabled={resultado.lineas.length === 0}
                onClick={() => window.print()}
                className="rounded-md bg-azul-700 px-3 py-2 text-sm font-semibold text-white hover:bg-azul-800 disabled:opacity-40"
              >
                Imprimir o guardar PDF
              </button>
            </div>
          </header>

          {resultado.lineas.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gris-500">
              Este cliente no tuvo envases arrendados entre el {fechaCorta(resultado.periodo.desde)} y el{' '}
              {fechaCorta(resultado.periodo.corte)}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gris-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Cód. envase</th>
                    <th className="px-3 py-3 font-medium">Cód. arriendo</th>
                    <th className="px-3 py-3 font-medium">Producto</th>
                    <th className="px-3 py-3 text-right font-medium">Envases</th>
                    <th className="px-5 py-3 text-right font-medium">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gris-100">
                  {resultado.lineas.map((l) => (
                    <tr key={l.codigo_arriendo}>
                      <td className="px-5 py-2.5 font-medium text-gris-900">{l.envase_codigo}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gris-700">{l.codigo_arriendo}</td>
                      <td className="px-3 py-2.5 text-gris-700">{l.producto}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gris-900">{numero.format(l.envases)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gris-900">{numero.format(l.dias)}</td>
                    </tr>
                  ))}
                </tbody>
                {t ? (
                  <tfoot className="border-t-2 border-gris-200 font-bold text-gris-900">
                    <tr>
                      <td className="px-5 py-3" colSpan={3}>
                        Total
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{numero.format(t.envases)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{numero.format(t.dias)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}

          <footer className="space-y-1 border-t border-gris-200 px-5 py-4 text-xs leading-relaxed text-gris-500">
            <p>
              <strong className="text-gris-700">Envases:</strong> los que el cliente todavía tenía en su poder al{' '}
              {formatoDiaLargo(resultado.periodo.corte)}. Un tipo de envase puede tener 0 envases y días: se devolvió dentro del mes.
            </p>
            <p>
              <strong className="text-gris-700">Días:</strong> suma de los días de cada envase dentro del período. El día de la
              devolución no se cuenta, igual que en el informe de KAME. Los envases de categoría PRO no se arriendan.
            </p>
            <p className="print:hidden">
              Generado el {resultado.generado.toLocaleString('es-CL', { hourCycle: 'h23' })}. El sistema no calcula montos: el
              valor se factura en KAME.
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}
