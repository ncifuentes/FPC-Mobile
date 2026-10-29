import { useCallback, useEffect, useState } from 'react';
import {
  cargarCilindro,
  cargarHistorial,
  destinoVolver,
  MAXIMO_HISTORIAL,
  seriesParecidas,
  urlFicha,
  type Cilindro,
  type MovimientoHistorial,
} from '../lib/cilindros';
import { diaEnChile, diasEntre, formatoDuracion, formatoFecha, formatoFechaHora, NOMBRE_ESTADO, NOMBRE_TIPO, numero } from '../lib/formato';
import { COLOR_ESTADO, COLOR_TIPO } from '../lib/estilos';
import { llegoConRetraso, minutosDeRetraso } from '../lib/tablero';
import { escucharMovimientos, type Conexion } from '../lib/tiempoReal';
import IndicadorConexion from './IndicadorConexion';

type Carga =
  | { estado: 'sin_serie' }
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'no_existe'; serie: string; parecidas: string[] }
  | { estado: 'listo'; cilindro: Cilindro; historial: MovimientoHistorial[] };

const NOMBRE_ENVASE: Record<string, string> = { cilindro: 'Cilindro', paquete: 'Paquete', termo: 'Termo' };
const NOMBRE_UNIDAD: Record<string, string> = { m3: 'm³', kg: 'kg' };

function serieDeLaUrl(): string {
  return new URLSearchParams(window.location.search).get('serie')?.trim() ?? '';
}

/**
 * Ficha del cilindro (HU-16): ubicación actual, cuánto tiempo lleva ahí e historial completo
 * de movimientos. Se actualiza sola cuando la app sincroniza un movimiento de este envase.
 */
export default function FichaCilindro() {
  const [serie] = useState(serieDeLaUrl);
  const [carga, setCarga] = useState<Carga>(serie ? { estado: 'cargando' } : { estado: 'sin_serie' });
  const [conexion, setConexion] = useState<Conexion>('conectando');
  const [volver] = useState(destinoVolver);

  const cargar = useCallback(async () => {
    try {
      const cilindro = await cargarCilindro(serie);
      if (!cilindro) {
        setCarga({ estado: 'no_existe', serie, parecidas: await seriesParecidas(serie) });
        return;
      }
      const historial = await cargarHistorial(cilindro.id);
      setCarga({ estado: 'listo', cilindro, historial });
    } catch {
      setCarga({ estado: 'error' });
    }
  }, [serie]);

  useEffect(() => {
    if (serie) void cargar();
  }, [serie, cargar]);

  const cilindroId = carga.estado === 'listo' ? carga.cilindro.id : null;
  const serieEncontrada = carga.estado === 'listo' ? carga.cilindro.numero_serie : null;

  useEffect(() => {
    if (serieEncontrada) document.title = `${serieEncontrada} · Cilindros · FPC Servicios`;
  }, [serieEncontrada]);

  // En vivo: solo los cambios de este cilindro.
  useEffect(() => {
    if (!cilindroId) return;
    return escucharMovimientos({
      canal: `ficha-${cilindroId}`,
      filtro: `cilindro_id=eq.${cilindroId}`,
      alCambiar: () => void cargar(),
      alCambiarConexion: setConexion,
    });
  }, [cilindroId, cargar]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={volver.href}
          className="inline-flex items-center gap-1.5 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm font-semibold text-gris-700 hover:bg-gris-50"
        >
          <span aria-hidden="true">←</span> {volver.texto}
        </a>
        <Buscador inicial={serie} />
      </div>

      {carga.estado === 'sin_serie' ? (
        <p className="text-sm text-gris-500">Escribe un número de serie para ver la ficha del cilindro.</p>
      ) : carga.estado === 'cargando' ? (
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
        <NoExiste serie={carga.serie} parecidas={carga.parecidas} />
      ) : (
        <Ficha cilindro={carga.cilindro} historial={carga.historial} conexion={conexion} />
      )}
    </div>
  );
}

function Buscador({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  return (
    <form
      role="search"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (texto.trim()) window.location.href = urlFicha(texto.trim());
      }}
      className="flex w-full max-w-md gap-2"
    >
      <label htmlFor="buscar-serie" className="sr-only">
        N° de serie
      </label>
      <input
        id="buscar-serie"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar N° de serie…"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900"
      />
      <button type="submit" className="rounded-md bg-azul-700 px-4 py-2 text-sm font-semibold text-white hover:bg-azul-800">
        Buscar
      </button>
    </form>
  );
}

function NoExiste({ serie, parecidas }: { serie: string; parecidas: string[] }) {
  return (
    <div className="rounded-lg border border-gris-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-bold text-gris-900">No existe un cilindro con la serie «{serie}»</h1>
      <p className="mt-1 text-sm text-gris-500">La búsqueda no distingue mayúsculas ni espacios.</p>
      {parecidas.length ? (
        <div className="mt-4">
          <p className="text-sm text-gris-700">Series parecidas:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {parecidas.map((p) => (
              <li key={p}>
                <a href={urlFicha(p)} className="inline-block rounded-full bg-azul-50 px-3 py-1 text-sm font-medium text-azul-700 hover:bg-azul-100">
                  {p}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Ficha({ cilindro, historial, conexion }: { cilindro: Cilindro; historial: MovimientoHistorial[]; conexion: Conexion }) {
  const p = cilindro.productos;
  const capacidad = p?.capacidad != null ? `${numero.format(p.capacidad)} ${NOMBRE_UNIDAD[p.unidad ?? ''] ?? p.unidad ?? ''}` : null;
  const esPro = p?.envase_codigo === 'PRO';

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gris-500">Ficha del cilindro</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gris-900">{cilindro.numero_serie}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ESTADO[cilindro.estado]}`}>
              {NOMBRE_ESTADO[cilindro.estado]}
            </span>
            {!cilindro.activo ? (
              <span className="rounded-full bg-gris-100 px-2.5 py-0.5 text-xs font-semibold text-gris-500">Dado de baja</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gris-500">
            {[p?.nombre, p?.tipo_envase ? NOMBRE_ENVASE[p.tipo_envase] : null, capacidad].filter(Boolean).join(' · ')}
          </p>
        </div>
        <IndicadorConexion conexion={conexion} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Ubicacion cilindro={cilindro} ultimo={historial[0]} />

          <section className="rounded-lg border border-gris-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-gris-900">Datos del envase</h2>
            <dl className="mt-3 divide-y divide-gris-100 text-sm">
              <Dato nombre="Código de arriendo" valor={p?.codigo} />
              <Dato nombre="Tipo de envase (KAME)" valor={p?.envase_codigo} />
              <Dato nombre="Gas habitual" valor={p?.gas_habitual} />
              <Dato nombre="Depósito" valor={cilindro.deposito} />
              <Dato nombre="Código de barras" valor={cilindro.codigo_barras} />
              <Dato nombre="Arriendo" valor={esPro ? 'No se cobra (categoría PRO)' : 'Se cobra'} />
            </dl>
          </section>
        </div>

        <Historial historial={historial} />
      </div>
    </>
  );
}

function Dato({ nombre, valor }: { nombre: string; valor: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-gris-500">{nombre}</dt>
      <dd className="text-right font-medium text-gris-900">{valor || '—'}</dd>
    </div>
  );
}

function Ubicacion({ cilindro, ultimo }: { cilindro: Cilindro; ultimo?: MovimientoHistorial }) {
  const hoy = diaEnChile();
  let titulo: string;
  let detalle: string | null = null;
  let desde: string | null = null;

  if (cilindro.estado === 'en_cliente') {
    const s = cilindro.sucursales;
    titulo = s?.clientes?.nombre ?? 'Cliente';
    detalle = [s?.nombre, s?.direccion, s?.comuna].filter(Boolean).join(' · ');
    desde = cilindro.en_cliente_desde;
  } else if (cilindro.estado === 'en_camion') {
    titulo = ultimo?.patente ? `Camión ${ultimo.patente}` : 'En un camión';
    detalle = ultimo?.tecnico_nombre ?? null;
    desde = ultimo?.fecha_evento ?? null;
  } else {
    titulo = 'Planta FPC';
    detalle = ultimo ? null : 'Sin movimientos registrados desde la carga inicial';
  }
  const dias = desde ? diasEntre(diaEnChile(new Date(desde)), hoy) : null;

  return (
    <section className="rounded-lg border border-azul-100 bg-azul-50 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-azul-700">Ubicación actual</h2>
      <p className="mt-2 text-lg font-bold text-gris-900">{titulo}</p>
      {detalle ? <p className="text-sm text-gris-700">{detalle}</p> : null}
      {desde ? (
        <p className="mt-3 text-sm text-gris-700">
          Desde el {formatoFechaHora(desde)}
          <span className="mt-1 block text-2xl font-bold tabular-nums text-gris-900">
            {dias === 0 ? 'Hoy' : `${numero.format(dias ?? 0)} ${dias === 1 ? 'día' : 'días'}`}
          </span>
        </p>
      ) : null}
      {cilindro.estado === 'en_cliente' && cilindro.sucursales?.clientes?.rut ? (
        <p className="mt-3 text-xs text-gris-500">RUT {cilindro.sucursales.clientes.rut}</p>
      ) : null}
    </section>
  );
}

function Historial({ historial }: { historial: MovimientoHistorial[] }) {
  return (
    <section className="min-w-0 rounded-lg border border-gris-200 bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-4 border-b border-gris-200 px-5 py-4">
        <h2 className="text-base font-bold text-gris-900">Historial de movimientos</h2>
        <p className="text-xs text-gris-500">
          {numero.format(historial.length)} {historial.length === 1 ? 'movimiento' : 'movimientos'} · más reciente arriba
        </p>
      </header>
      {historial.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gris-500">
          Este cilindro no tiene movimientos. Está en planta desde la carga inicial del parque.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gris-500">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha y hora</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 font-medium">Cliente · sucursal</th>
                <th className="px-3 py-3 font-medium">Técnico</th>
                <th className="px-5 py-3 text-right font-medium">Llegó</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {historial.map((m) => {
                const tarde = llegoConRetraso(m);
                return (
                  <tr key={m.uuid_local} className={tarde ? 'bg-alerta-fondo/50' : undefined}>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gris-700">
                      {formatoFechaHora(m.fecha_evento)}
                      {m.codigo_origen === 'manual' ? (
                        <span className="ml-2 text-xs text-alerta" title="Código ingresado a mano">
                          manual
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {m.tipo ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_TIPO[m.tipo]}`}>{NOMBRE_TIPO[m.tipo]}</span>
                      ) : null}
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
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs tabular-nums">
                      {tarde ? (
                        <span className="font-semibold text-alerta">+{formatoDuracion(minutosDeRetraso(m))}</span>
                      ) : (
                        <span className="text-gris-500">al momento</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {historial.length >= MAXIMO_HISTORIAL ? (
        <p className="border-t border-gris-200 px-5 py-3 text-xs text-alerta">
          Se muestran los {numero.format(MAXIMO_HISTORIAL)} movimientos más recientes.
        </p>
      ) : null}
      {historial.length ? (
        <p className="border-t border-gris-200 px-5 py-3 text-xs text-gris-500">
          Primer movimiento registrado: {formatoFecha(historial.at(-1)?.fecha_evento ?? null)}
        </p>
      ) : null}
    </section>
  );
}
