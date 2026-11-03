import { useCallback, useEffect, useMemo, useState } from 'react';
import { cargarFichaCliente, MOVIMIENTOS_RECIENTES, urlInforme, type FichaCliente as Datos, type Sucursal } from '../lib/clientes';
import { urlFicha } from '../lib/cilindros';
import { diaEnChile, diasEntre, formatoFecha, formatoFechaHora, NOMBRE_TIPO, numero } from '../lib/formato';
import { COLOR_TIPO } from '../lib/estilos';
import { escucharMovimientos, type Conexion } from '../lib/tiempoReal';
import { listaClientesReciente } from './ListaClientes';
import IndicadorConexion from './IndicadorConexion';

type Carga = { estado: 'cargando' } | { estado: 'error' } | { estado: 'no_existe' } | { estado: 'listo'; datos: Datos };

function idDeLaUrl(): string {
  return new URLSearchParams(window.location.search).get('id')?.trim() ?? '';
}

/** Días que lleva un cilindro en el cliente, en días calendario de Chile. */
function diasEnCliente(desde: string | null, hoy: string): number {
  return desde ? diasEntre(diaEnChile(new Date(desde)), hoy) : 0;
}

/**
 * Ficha del cliente (HU-17): sus sucursales, los cilindros que tiene en su poder y cuánto
 * tiempo llevan ahí, y sus últimos movimientos. Lleva al informe de arriendo del mes.
 */
export default function FichaCliente() {
  const [id] = useState(idDeLaUrl);
  const [carga, setCarga] = useState<Carga>(id ? { estado: 'cargando' } : { estado: 'no_existe' });
  const [conexion, setConexion] = useState<Conexion>('conectando');
  const [sucursal, setSucursal] = useState('');
  const [volver] = useState(() => {
    try {
      const desde = document.referrer ? new URL(document.referrer) : null;
      if (desde?.origin === window.location.origin && desde.pathname.startsWith('/informe'))
        return { href: desde.pathname + desde.search, texto: 'Volver al informe' };
    } catch {
      // referrer ilegible
    }
    return { href: listaClientesReciente(), texto: 'Volver a la lista de clientes' };
  });

  const cargar = useCallback(async () => {
    try {
      const datos = await cargarFichaCliente(id);
      setCarga(datos ? { estado: 'listo', datos } : { estado: 'no_existe' });
    } catch {
      setCarga({ estado: 'error' });
    }
  }, [id]);

  useEffect(() => {
    if (id) void cargar();
  }, [id, cargar]);

  const nombre = carga.estado === 'listo' ? carga.datos.cliente.nombre : null;
  useEffect(() => {
    if (nombre) document.title = `${nombre} · Clientes · FPC Servicios`;
  }, [nombre]);

  // En vivo: Realtime no puede filtrar por cliente (el movimiento solo trae la sucursal), así que
  // cualquier cambio en movimientos vuelve a leer la ficha. Son tres consultas chicas.
  const listo = carga.estado === 'listo';
  useEffect(() => {
    if (!listo) return;
    return escucharMovimientos({ canal: `cliente-${id}`, alCambiar: () => void cargar(), alCambiarConexion: setConexion, espera: 1000 });
  }, [listo, id, cargar]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a
          href={volver.href}
          className="inline-flex items-center gap-1.5 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-semibold text-gris-700 hover:bg-gris-50"
        >
          <span aria-hidden="true">←</span> {volver.texto}
        </a>
      </div>
      {carga.estado === 'cargando' ? (
        <p className="text-sm text-gris-500">Cargando…</p>
      ) : carga.estado === 'error' ? (
        <p role="alert" className="rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudo cargar la ficha. Revisa tu conexión;{' '}
          <button type="button" className="font-semibold underline" onClick={() => void cargar()}>
            reintentar
          </button>
          .
        </p>
      ) : carga.estado === 'no_existe' ? (
        <div className="rounded-lg border border-gris-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-gris-900">No se encontró el cliente</h1>
          <p className="mt-1 text-sm text-gris-500">
            Búscalo en la{' '}
            <a href="/clientes" className="font-semibold text-azul-700 underline">
              lista de clientes
            </a>
            .
          </p>
        </div>
      ) : (
        <Ficha datos={carga.datos} conexion={conexion} sucursal={sucursal} onSucursal={setSucursal} />
      )}
    </div>
  );
}

function Ficha({
  datos,
  conexion,
  sucursal,
  onSucursal,
}: {
  datos: Datos;
  conexion: Conexion;
  sucursal: string;
  onSucursal: (id: string) => void;
}) {
  const { cliente, sucursales, enPoder, recientes } = datos;
  const hoy = diaEnChile();
  const nombreSucursal = useMemo(() => new Map(sucursales.map((s) => [s.id, s.nombre])), [sucursales]);
  const porSucursal = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of enPoder) if (c.sucursal_actual_id) m.set(c.sucursal_actual_id, (m.get(c.sucursal_actual_id) ?? 0) + 1);
    return m;
  }, [enPoder]);
  const visibles = sucursal ? enPoder.filter((c) => c.sucursal_actual_id === sucursal) : enPoder;
  const masAntiguo = enPoder.length ? Math.max(...enPoder.map((c) => diasEnCliente(c.en_cliente_desde, hoy))) : null;
  const activas = sucursales.filter((s) => s.activo).length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gris-500">Ficha del cliente</p>
          <h1 className="mt-1 text-2xl font-bold text-gris-900">
            {cliente.nombre}
            {!cliente.activo ? <span className="ml-3 align-middle text-sm font-semibold text-gris-500">inactivo</span> : null}
          </h1>
          <p className="mt-1 text-sm text-gris-500">
            RUT {cliente.rut} · Código KAME{' '}
            {cliente.codigo_kame ?? <span title="Falta el cruce código KAME ↔ RUT que debe enviar el cliente">pendiente</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IndicadorConexion conexion={conexion} />
          <a href={urlInforme(cliente.id)} className="rounded-md bg-azul-700 px-4 py-2 text-sm font-semibold text-white hover:bg-azul-800">
            Informe de arriendo del mes
          </a>
        </div>
      </div>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Indicador titulo="Cilindros en poder" valor={numero.format(enPoder.length)} />
        <Indicador titulo="Sucursales activas" valor={numero.format(activas)} />
        <Indicador
          titulo="Envase más antiguo"
          valor={masAntiguo === null ? '—' : masAntiguo === 0 ? 'Hoy' : `${numero.format(masAntiguo)} ${masAntiguo === 1 ? 'día' : 'días'}`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section aria-label="Sucursales" className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-gris-900">Sucursales</h2>
          {sucursales.map((s) => (
            <TarjetaSucursal
              key={s.id}
              s={s}
              cilindros={porSucursal.get(s.id) ?? 0}
              elegida={sucursal === s.id}
              onElegir={() => onSucursal(sucursal === s.id ? '' : s.id)}
            />
          ))}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gris-200 px-5 py-4">
              <h2 className="text-base font-bold text-gris-900">Cilindros en poder del cliente</h2>
              {sucursales.length > 1 ? (
                <select
                  aria-label="Sucursal"
                  value={sucursal}
                  onChange={(e) => onSucursal(e.target.value)}
                  className="rounded-md border border-gris-300 bg-white px-3 py-1.5 text-sm text-gris-900"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              ) : null}
            </header>
            {visibles.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gris-500">
                {enPoder.length === 0 ? 'El cliente no tiene cilindros en su poder.' : 'Esta sucursal no tiene cilindros.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gris-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">N° de serie</th>
                      <th className="px-3 py-3 font-medium">Producto</th>
                      <th className="px-3 py-3 font-medium">Sucursal</th>
                      <th className="px-3 py-3 font-medium">Entregado</th>
                      <th className="px-5 py-3 text-right font-medium">Días</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gris-100">
                    {visibles.map((c) => (
                      <tr key={c.id} className="hover:bg-gris-50">
                        <td className="px-5 py-2.5">
                          <a href={urlFicha(c.numero_serie)} className="font-medium text-azul-700 hover:underline">
                            {c.numero_serie}
                          </a>
                        </td>
                        <td className="px-3 py-2.5 text-gris-700">
                          {c.productos?.nombre}
                          {c.productos?.envase_codigo === 'PRO' ? <span className="ml-2 text-xs text-gris-500">PRO · no se arrienda</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-gris-700">{c.sucursal_actual_id ? nombreSucursal.get(c.sucursal_actual_id) : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gris-700">{formatoFecha(c.en_cliente_desde)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gris-900">
                          {numero.format(diasEnCliente(c.en_cliente_desde, hoy))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-gris-200 px-5 py-3 text-xs text-gris-500">
              Días desde la entrega hasta hoy. El cobro del mes sale del{' '}
              <a href={urlInforme(cliente.id)} className="font-semibold text-azul-700 hover:underline">
                informe de arriendo
              </a>
              , que cuenta los días dentro del período.
            </p>
          </section>

          <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
            <header className="flex items-baseline justify-between gap-4 border-b border-gris-200 px-5 py-4">
              <h2 className="text-base font-bold text-gris-900">Últimos movimientos</h2>
              <p className="text-xs text-gris-500">hasta {MOVIMIENTOS_RECIENTES}, más reciente arriba</p>
            </header>
            {recientes.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gris-500">Todavía no hay entregas ni retiros registrados para este cliente.</p>
            ) : (
              <ul className="divide-y divide-gris-100">
                {recientes.map((m) => (
                  <li key={m.uuid_local} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                    <span className="w-36 shrink-0 tabular-nums text-gris-700">{formatoFechaHora(m.fecha_evento)}</span>
                    {m.tipo ? (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_TIPO[m.tipo]}`}>{NOMBRE_TIPO[m.tipo]}</span>
                    ) : null}
                    <a href={urlFicha(m.numero_serie)} className="font-medium text-azul-700 hover:underline">
                      {m.numero_serie}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-gris-500">
                      {m.sucursal_nombre} · {m.tecnico_nombre} · {m.patente}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <article className="rounded-lg border border-gris-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-gris-500">{titulo}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-gris-900">{valor}</p>
    </article>
  );
}

function TarjetaSucursal({ s, cilindros, elegida, onElegir }: { s: Sucursal; cilindros: number; elegida: boolean; onElegir: () => void }) {
  const lugar = [s.comuna, s.ciudad && s.ciudad.toLowerCase() !== s.comuna?.toLowerCase() ? s.ciudad : null, s.region].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={elegida}
      className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:border-azul-200 ${
        elegida ? 'border-azul-500 ring-2 ring-azul-100' : 'border-gris-200'
      } ${s.activo ? '' : 'opacity-60'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gris-900">
          {s.nombre}
          {s.es_principal ? <span className="ml-2 text-xs font-medium text-azul-700">principal</span> : null}
          {!s.activo ? <span className="ml-2 text-xs font-medium text-gris-500">inactiva</span> : null}
        </p>
        <span className="shrink-0 rounded-full bg-gris-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gris-700">
          {cilindros} cil.
        </span>
      </div>
      {s.direccion ? <p className="mt-1 text-sm text-gris-700">{s.direccion}</p> : null}
      {lugar ? <p className="text-xs text-gris-500">{lugar}</p> : null}
      {s.contacto || s.telefono || s.email ? (
        <dl className="mt-2 space-y-0.5 text-xs text-gris-500">
          {s.contacto ? <dd>{s.contacto}</dd> : null}
          {s.telefono ? <dd className="tabular-nums">{s.telefono}</dd> : null}
          {s.email ? <dd className="truncate">{s.email}</dd> : null}
        </dl>
      ) : null}
    </button>
  );
}
