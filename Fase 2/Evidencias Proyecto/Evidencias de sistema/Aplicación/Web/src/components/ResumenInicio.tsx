import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { obtenerPerfil } from '../lib/sesion';
import type { Enum, Fila } from '../lib/database.types';
import { formatoFechaHora, inicioDeHoyEnChile, NOMBRE_TIPO, numero } from '../lib/formato';
import { COLOR_ESTADO, COLOR_TIPO } from '../lib/estilos';
import { urlFicha } from '../lib/cilindros';

type Estado = Enum<'estado_cilindro'>;
type Movimiento = Pick<
  Fila<'v_movimientos'>,
  'uuid_local' | 'tipo' | 'fecha_evento' | 'numero_serie' | 'producto_nombre' | 'cliente_nombre' | 'tecnico_nombre' | 'patente' | 'codigo_origen'
>;

interface Datos {
  nombre: string;
  porEstado: Record<Estado, number>;
  movimientosHoy: number;
  recientes: Movimiento[];
}

const ESTADOS: { estado: Estado; titulo: string; detalle: string; clase: string }[] = [
  { estado: 'en_planta', titulo: 'En planta', detalle: 'En poder de FPC', clase: COLOR_ESTADO.en_planta },
  { estado: 'en_camion', titulo: 'En camión', detalle: 'Cargados en un vehículo', clase: COLOR_ESTADO.en_camion },
  { estado: 'en_cliente', titulo: 'En cliente', detalle: 'Entregados, generan arriendo', clase: COLOR_ESTADO.en_cliente },
];

async function contarEstado(estado: Estado): Promise<number> {
  const { count, error } = await supabase
    .from('cilindros')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('estado', estado);
  if (error) throw error;
  return count ?? 0;
}

async function cargarDatos(): Promise<Datos> {
  const perfil = await obtenerPerfil();
  const [planta, camion, cliente, hoy, recientes] = await Promise.all([
    contarEstado('en_planta'),
    contarEstado('en_camion'),
    contarEstado('en_cliente'),
    supabase
      .from('movimientos')
      .select('uuid_local', { count: 'exact', head: true })
      .gte('fecha_evento', inicioDeHoyEnChile()),
    supabase
      .from('v_movimientos')
      .select('uuid_local, tipo, fecha_evento, numero_serie, producto_nombre, cliente_nombre, tecnico_nombre, patente, codigo_origen')
      .order('fecha_evento', { ascending: false })
      .limit(8),
  ]);
  if (hoy.error) throw hoy.error;
  if (recientes.error) throw recientes.error;

  return {
    nombre: perfil?.nombre.split(' ')[0] ?? '',
    porEstado: { en_planta: planta, en_camion: camion, en_cliente: cliente },
    movimientosHoy: hoy.count ?? 0,
    recientes: recientes.data,
  };
}

/** Portada del panel: dónde está el parque y la actividad más reciente. */
export default function ResumenInicio() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    cargarDatos()
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-md bg-error-fondo p-4 text-sm text-error">
        No se pudieron cargar los datos. Revisa tu conexión y recarga la página.
      </p>
    );
  }

  if (!datos) return <p className="text-sm text-gris-500">Cargando…</p>;

  const total = Object.values(datos.porEstado).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Hola, {datos.nombre}</h1>
        <p className="mt-1 text-sm text-gris-500">
          Parque de {numero.format(total)} envases activos · {numero.format(datos.movimientosHoy)} movimientos hoy
        </p>
      </div>

      <section aria-label="Ubicación del parque" className="grid gap-4 sm:grid-cols-3">
        {ESTADOS.map(({ estado, titulo, detalle, clase }) => (
          <article key={estado} className="rounded-lg border border-gris-200 bg-white p-5 shadow-sm">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${clase}`}>{titulo}</span>
            <p className="mt-3 text-3xl font-bold tabular-nums text-gris-900">
              {numero.format(datos.porEstado[estado])}
            </p>
            <p className="mt-1 text-sm text-gris-500">{detalle}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-gris-200 px-5 py-4">
          <h2 className="text-base font-bold text-gris-900">Últimos movimientos</h2>
          <a href="/tablero" className="text-sm font-semibold text-azul-700 hover:underline">
            Ver tablero del día →
          </a>
        </header>
        {datos.recientes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gris-500">Todavía no hay movimientos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gris-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Tipo</th>
                  <th className="px-5 py-3 font-medium">N° de serie</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Técnico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gris-100">
                {datos.recientes.map((m) => (
                  <tr key={m.uuid_local} className="hover:bg-gris-50">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gris-700">
                      {formatoFechaHora(m.fecha_evento)}
                    </td>
                    <td className="px-5 py-3">
                      {m.tipo ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_TIPO[m.tipo]}`}>
                          {NOMBRE_TIPO[m.tipo]}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
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
                    <td className="px-5 py-3 text-gris-700">{m.cliente_nombre ?? 'Planta'}</td>
                    <td className="px-5 py-3 text-gris-700">
                      {m.tecnico_nombre}
                      <span className="block text-xs text-gris-500">{m.patente}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
