import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { escucharMovimientos, type Conexion } from '../lib/tiempoReal';
import IndicadorConexion from './IndicadorConexion';
import {
  diaEnChile,
  esDiaValido,
  formatoDiaLargo,
  formatoDuracion,
  formatoHora,
  NOMBRE_TIPO,
  numero,
  sumarDias,
} from '../lib/formato';
import { COLOR_ESTADO, COLOR_TIPO } from '../lib/estilos';
import { urlFicha } from '../lib/cilindros';
import {
  cargarCamiones,
  cargarMovimientosDelDia,
  cargarParque,
  contarPorTipo,
  filtrar,
  llegoConRetraso,
  MAXIMO_FILAS_DIA,
  minutosDeRetraso,
  MINUTOS_RETRASO_AVISO,
  resumirPorCamion,
  ultimoDiaConMovimientos,
  type Filtros,
  type MovimientoDia,
  type Tipo,
} from '../lib/tablero';

interface Datos {
  parque: Awaited<ReturnType<typeof cargarParque>>;
  movimientos: MovimientoDia[];
}

const TIPOS: Tipo[] = ['carga', 'entrega', 'retiro'];
const FILTROS_VACIOS: Filtros = { tipo: '', camionId: '', serie: '' };

/** Día pedido en la URL (?dia=AAAA-MM-DD) o, si no viene, hoy en Chile. */
function diaInicial(): string {
  const pedido = new URLSearchParams(window.location.search).get('dia');
  return esDiaValido(pedido) ? pedido : diaEnChile();
}

/**
 * Tablero del día (HU-15) en tiempo real (HU-19). Se suscribe a los cambios de la tabla
 * movimientos por Realtime; cada inserción, corrección o borrado vuelve a leer el día y los
 * contadores, así el tablero refleja lo que sincroniza la app sin recargar la página.
 */
export default function TableroDia() {
  const hoy = diaEnChile();
  const [dia, setDia] = useState(diaInicial);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [camiones, setCamiones] = useState<Awaited<ReturnType<typeof cargarCamiones>>>([]);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [conexion, setConexion] = useState<Conexion>('conectando');
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const [ultimoConDatos, setUltimoConDatos] = useState<string | null>(null);

  const diaRef = useRef(dia);
  const vistos = useRef<Set<string> | null>(null);

  const cargar = useCallback(async (diaPedido: string, marcarNuevos: boolean) => {
    try {
      const [parque, movimientos] = await Promise.all([cargarParque(), cargarMovimientosDelDia(diaPedido)]);
      if (diaRef.current !== diaPedido) return; // el usuario cambió de día mientras cargaba
      if (marcarNuevos && vistos.current) {
        const recien = movimientos.filter((m) => m.uuid_local && !vistos.current!.has(m.uuid_local));
        if (recien.length) {
          setNuevos(new Set(recien.map((m) => m.uuid_local!)));
          window.setTimeout(() => setNuevos(new Set()), 4000);
        }
      }
      vistos.current = new Set(movimientos.map((m) => m.uuid_local ?? ''));
      setDatos({ parque, movimientos });
      setError(false);
      if (movimientos.length === 0) {
        const ultimo = await ultimoDiaConMovimientos(diaPedido);
        if (diaRef.current === diaPedido) setUltimoConDatos(ultimo ? diaEnChile(new Date(ultimo)) : null);
      }
    } catch {
      if (diaRef.current === diaPedido) setError(true);
    }
  }, []);

  // Carga inicial y cada vez que cambia el día.
  useEffect(() => {
    diaRef.current = dia;
    vistos.current = null;
    setDatos(null);
    setUltimoConDatos(null);
    void cargar(dia, false);

    const url = new URL(window.location.href);
    if (dia === diaEnChile()) url.searchParams.delete('dia');
    else url.searchParams.set('dia', dia);
    window.history.replaceState(null, '', url);
  }, [dia, cargar]);

  // Catálogo de camiones para el filtro (no cambia durante la jornada).
  useEffect(() => {
    cargarCamiones()
      .then(setCamiones)
      .catch(() => setCamiones([]));
  }, []);

  // Suscripción en tiempo real: cualquier cambio en movimientos vuelve a leer el día.
  useEffect(
    () =>
      escucharMovimientos({
        canal: 'tablero-movimientos',
        alCambiar: () => void cargar(diaRef.current, true),
        alCambiarConexion: setConexion,
      }),
    [cargar],
  );

  const visibles = useMemo(() => (datos ? filtrar(datos.movimientos, filtros) : []), [datos, filtros]);
  const conteo = useMemo(() => contarPorTipo(datos?.movimientos ?? []), [datos]);
  const porCamion = useMemo(() => resumirPorCamion(datos?.movimientos ?? []), [datos]);
  const conRetraso = useMemo(() => (datos?.movimientos ?? []).filter(llegoConRetraso).length, [datos]);
  const hayFiltros = filtros.tipo !== '' || filtros.camionId !== '' || filtros.serie.trim() !== '';
  const esHoy = dia === hoy;

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado: día y estado de la conexión en vivo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Tablero del día</h1>
          <p className="mt-1 text-sm text-gris-500 first-letter:uppercase">
            {formatoDiaLargo(dia)} · hora de Chile
          </p>
        </div>
        <IndicadorConexion conexion={conexion} />
      </div>

      <SelectorDia dia={dia} hoy={hoy} onCambiar={setDia} />

      {error ? (
        <p role="alert" className="rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudieron cargar los movimientos. Revisa tu conexión;{' '}
          <button type="button" className="font-semibold underline" onClick={() => void cargar(dia, false)}>
            reintentar
          </button>
          .
        </p>
      ) : null}

      {/* Contadores */}
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Contador titulo="En planta" clase={COLOR_ESTADO.en_planta} valor={datos?.parque.en_planta} nota="Ahora" />
        <Contador titulo="En camión" clase={COLOR_ESTADO.en_camion} valor={datos?.parque.en_camion} nota="Ahora" />
        <Contador titulo="En cliente" clase={COLOR_ESTADO.en_cliente} valor={datos?.parque.en_cliente} nota="Ahora" />
        <article className="rounded-lg border border-gris-200 bg-white p-5 shadow-sm">
          <span className="inline-block rounded-full bg-gris-100 px-2.5 py-0.5 text-xs font-semibold text-gris-700">
            {esHoy ? 'Movimientos de hoy' : 'Movimientos del día'}
          </span>
          <p className="mt-3 text-3xl font-bold tabular-nums text-gris-900">
            {datos ? numero.format(datos.movimientos.length) : '…'}
          </p>
          <p className="mt-1 text-sm text-gris-500">
            {datos
              ? TIPOS.map((t) => `${numero.format(conteo[t])} ${NOMBRE_TIPO[t].toLowerCase()}${conteo[t] === 1 ? '' : 's'}`).join(' · ')
              : ' '}
          </p>
        </article>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Movimientos */}
        <section className="min-w-0 rounded-lg border border-gris-200 bg-white shadow-sm">
          <header className="flex flex-col gap-3 border-b border-gris-200 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-gris-900">Movimientos</h2>
              {datos ? (
                <p className="text-xs text-gris-500">
                  {hayFiltros
                    ? `${numero.format(visibles.length)} de ${numero.format(datos.movimientos.length)}`
                    : `${numero.format(datos.movimientos.length)} en el día`}
                  {conRetraso > 0 ? (
                    <span className="ml-2 rounded-full bg-alerta-fondo px-2 py-0.5 font-semibold text-alerta">
                      {numero.format(conRetraso)} con retraso
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
            <BarraFiltros filtros={filtros} camiones={camiones} onCambiar={setFiltros} />
          </header>

          {!datos ? (
            <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
          ) : datos.movimientos.length === 0 ? (
            <SinMovimientos esHoy={esHoy} ultimo={ultimoConDatos} onIr={setDia} />
          ) : visibles.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gris-500">
              Ningún movimiento coincide con los filtros.{' '}
              <button type="button" className="font-semibold text-azul-700 underline" onClick={() => setFiltros(FILTROS_VACIOS)}>
                Quitar filtros
              </button>
            </p>
          ) : (
            <TablaMovimientos movimientos={visibles} nuevos={nuevos} />
          )}

          {datos && datos.movimientos.length >= MAXIMO_FILAS_DIA ? (
            <p className="border-t border-gris-200 px-5 py-3 text-xs text-alerta">
              Se muestran los {numero.format(MAXIMO_FILAS_DIA)} movimientos más recientes del día.
            </p>
          ) : null}
        </section>

        {/* Por camión */}
        <aside aria-label="Por camión" className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-gris-900">Por camión</h2>
          {datos && porCamion.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gris-300 p-4 text-sm text-gris-500">
              Ningún vehículo registró movimientos este día.
            </p>
          ) : null}
          {porCamion.map((c) => (
            <button
              key={c.camionId}
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, camionId: f.camionId === c.camionId ? '' : c.camionId }))}
              aria-pressed={filtros.camionId === c.camionId}
              className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-azul-200 ${
                filtros.camionId === c.camionId ? 'border-azul-500 ring-2 ring-azul-100' : 'border-gris-200'
              }`}
            >
              <p className="font-semibold text-gris-900">{c.patente}</p>
              <p className="truncate text-xs text-gris-500">{c.tecnicos.join(', ') || 'Sin técnico'}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {TIPOS.map((t) => (
                  <div key={t} className="rounded-sm bg-gris-50 py-1.5">
                    <dt className="text-[11px] text-gris-500">{NOMBRE_TIPO[t]}</dt>
                    <dd className="text-base font-bold tabular-nums text-gris-900">{c.conteo[t]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-gris-500">
                Último recibido: <span className="tabular-nums text-gris-700">{formatoHora(c.ultimoRecibido)}</span>
                {c.conRetraso > 0 ? <span className="text-alerta"> · {c.conRetraso} con retraso</span> : null}
              </p>
            </button>
          ))}
          <p className="text-xs leading-relaxed text-gris-500">
            «Con retraso»: llegaron al servidor {MINUTOS_RETRASO_AVISO} min o más después de ocurrir, porque el
            teléfono estaba sin señal. Lo que aún no sincroniza no se puede ver aquí: sigue en el teléfono.
          </p>
        </aside>
      </div>
    </div>
  );
}

function SelectorDia({ dia, hoy, onCambiar }: { dia: string; hoy: string; onCambiar: (d: string) => void }) {
  const boton =
    'rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-medium text-gris-700 hover:bg-gris-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={boton} onClick={() => onCambiar(sumarDias(dia, -1))} aria-label="Día anterior">
        ‹ Anterior
      </button>
      <label className="sr-only" htmlFor="dia">
        Día
      </label>
      <input
        id="dia"
        type="date"
        value={dia}
        max={hoy}
        onChange={(e) => {
          if (esDiaValido(e.target.value) && e.target.value <= hoy) onCambiar(e.target.value);
        }}
        className="rounded-md border border-gris-300 bg-white px-3 py-2 text-sm tabular-nums text-gris-900"
      />
      <button
        type="button"
        className={boton}
        onClick={() => onCambiar(sumarDias(dia, 1))}
        disabled={dia >= hoy}
        aria-label="Día siguiente"
      >
        Siguiente ›
      </button>
      {dia !== hoy ? (
        <button type="button" className={`${boton} text-azul-700`} onClick={() => onCambiar(hoy)}>
          Ir a hoy
        </button>
      ) : null}
    </div>
  );
}

function BarraFiltros({
  filtros,
  camiones,
  onCambiar,
}: {
  filtros: Filtros;
  camiones: { id: string; patente: string }[];
  onCambiar: (f: Filtros) => void;
}) {
  const campo = 'rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900';
  return (
    <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
      <label className="sr-only" htmlFor="filtro-tipo">
        Tipo
      </label>
      <select
        id="filtro-tipo"
        className={campo}
        value={filtros.tipo}
        onChange={(e) => onCambiar({ ...filtros, tipo: e.target.value as Tipo | '' })}
      >
        <option value="">Todos los tipos</option>
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {NOMBRE_TIPO[t]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filtro-camion">
        Camión
      </label>
      <select
        id="filtro-camion"
        className={campo}
        value={filtros.camionId}
        onChange={(e) => onCambiar({ ...filtros, camionId: e.target.value })}
      >
        <option value="">Todos los camiones</option>
        {camiones.map((c) => (
          <option key={c.id} value={c.id}>
            {c.patente}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filtro-serie">
        Buscar N° de serie
      </label>
      <input
        id="filtro-serie"
        type="search"
        className={campo}
        placeholder="Buscar N° de serie…"
        value={filtros.serie}
        onChange={(e) => onCambiar({ ...filtros, serie: e.target.value })}
      />
    </div>
  );
}

function Contador({ titulo, clase, valor, nota }: { titulo: string; clase: string; valor?: number; nota: string }) {
  return (
    <article className="rounded-lg border border-gris-200 bg-white p-5 shadow-sm">
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${clase}`}>{titulo}</span>
      <p className="mt-3 text-3xl font-bold tabular-nums text-gris-900">{valor === undefined ? '…' : numero.format(valor)}</p>
      <p className="mt-1 text-sm text-gris-500">{nota}</p>
    </article>
  );
}

function SinMovimientos({ esHoy, ultimo, onIr }: { esHoy: boolean; ultimo: string | null; onIr: (d: string) => void }) {
  return (
    <div className="px-5 py-8 text-sm text-gris-500">
      <p>{esHoy ? 'Todavía no hay movimientos hoy. Aparecerán aquí apenas la app los sincronice.' : 'No hubo movimientos este día.'}</p>
      {ultimo ? (
        <p className="mt-2">
          Último día con movimientos:{' '}
          <button type="button" className="font-semibold text-azul-700 underline" onClick={() => onIr(ultimo)}>
            {formatoDiaLargo(ultimo)}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function TablaMovimientos({ movimientos, nuevos }: { movimientos: MovimientoDia[]; nuevos: Set<string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-gris-500">
          <tr>
            <th className="px-5 py-3 font-medium">Hora</th>
            <th className="px-3 py-3 font-medium">Tipo</th>
            <th className="px-3 py-3 font-medium">N° de serie</th>
            <th className="px-3 py-3 font-medium">Cliente · sucursal</th>
            <th className="px-3 py-3 font-medium">Técnico</th>
            <th className="px-5 py-3 text-right font-medium">Llegó</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gris-100">
          {movimientos.map((m) => {
            const tarde = llegoConRetraso(m);
            const nuevo = m.uuid_local ? nuevos.has(m.uuid_local) : false;
            return (
              <tr
                key={m.uuid_local}
                className={`${nuevo ? 'bg-verde-100/60' : tarde ? 'bg-alerta-fondo/50' : ''} transition-colors hover:bg-gris-50`}
              >
                <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gris-700">{formatoHora(m.fecha_evento)}</td>
                <td className="px-3 py-3">
                  {m.tipo ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_TIPO[m.tipo]}`}>
                      {NOMBRE_TIPO[m.tipo]}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <a href={urlFicha(m.numero_serie)} className="font-medium text-azul-700 hover:underline">
                    {m.numero_serie}
                  </a>
                  {m.codigo_origen === 'manual' ? (
                    <span className="ml-2 text-xs text-alerta" title="Código ingresado a mano">
                      manual
                    </span>
                  ) : null}
                  <span className="block text-xs text-gris-500">{m.producto_nombre}</span>
                </td>
                <td className="px-3 py-3 text-gris-700">
                  {m.cliente_nombre ? (
                    <>
                      {m.cliente_nombre}
                      <span className="block text-xs text-gris-500">{m.sucursal_nombre}</span>
                    </>
                  ) : (
                    <span className="text-gris-500">— al camión</span>
                  )}
                </td>
                <td className="px-3 py-3 text-gris-700">
                  {m.tecnico_nombre}
                  <span className="block text-xs text-gris-500">{m.patente}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                  {tarde ? (
                    <span className="text-xs font-semibold text-alerta" title={`Sincronizado a las ${formatoHora(m.fecha_sync)}`}>
                      +{formatoDuracion(minutosDeRetraso(m))}
                    </span>
                  ) : (
                    <span className="text-xs text-gris-500" title={`Sincronizado a las ${formatoHora(m.fecha_sync)}`}>
                      al momento
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
