import { useEffect, useMemo, useState } from 'react';
import {
  cambios,
  corregirMovimiento,
  listarSucursalesConCliente,
  type OpcionSucursal,
  type RegistroAuditoria,
  type Tipo,
} from '../lib/correccion';
import { aHoraLocalChile, desdeHoraLocalChile, formatoFechaHora, NOMBRE_TIPO } from '../lib/formato';
import type { MovimientoHistorial } from '../lib/cilindros';
import { coincide, textoBuscable } from '../lib/clientes';
import { botonPrimario, botonSecundario, Cajon, Campo, claseCampo, ErrorFormulario } from './mantenedores/ui';

const TIPOS: Tipo[] = ['carga', 'entrega', 'retiro'];

/**
 * Corrección de un movimiento (HU-18). Muestra lo registrado al lado de la corrección y, debajo,
 * las correcciones anteriores de ese movimiento con quién y cuándo las hizo.
 */
export default function CorregirMovimiento({
  movimiento,
  serie,
  auditoria,
  nombres,
  puedeEditar,
  onCerrar,
  onGuardado,
}: {
  movimiento: MovimientoHistorial;
  serie: string;
  auditoria: RegistroAuditoria[];
  nombres: Map<string, string>;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [sucursales, setSucursales] = useState<OpcionSucursal[] | null>(null);
  const [tipo, setTipo] = useState<Tipo>(movimiento.tipo ?? 'entrega');
  const [fecha, setFecha] = useState(movimiento.fecha_evento ? aHoraLocalChile(movimiento.fecha_evento) : '');
  const [sucursalId, setSucursalId] = useState<string | null>(movimiento.sucursal_id);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    listarSucursalesConCliente()
      .then(setSucursales)
      .catch(() => setSucursales([]));
  }, []);

  const nombreSucursal = useMemo(() => {
    const m = new Map((sucursales ?? []).map((s) => [s.id, `${s.cliente} · ${s.nombre}`]));
    return (id: string | null) => (id ? (m.get(id) ?? 'otra sucursal') : 'sin cliente');
  }, [sucursales]);

  const filtradas = useMemo(() => {
    const lista = (sucursales ?? []).filter((s) => s.activo || s.id === sucursalId);
    return busqueda.trim() ? lista.filter((s) => coincide(textoBuscable(s.cliente, s.rut, s.nombre), busqueda)).slice(0, 40) : [];
  }, [sucursales, busqueda, sucursalId]);

  const necesitaSucursal = tipo !== 'carga';
  const errores = {
    fecha: !fecha ? 'Indica la fecha y hora.' : new Date(desdeHoraLocalChile(fecha)).getTime() > Date.now() + 5 * 60000 ? 'La fecha no puede ser futura.' : null,
    sucursal: necesitaSucursal && !sucursalId ? 'Una entrega o un retiro necesita la sucursal del cliente.' : null,
  };
  const original = {
    tipo: movimiento.tipo,
    fecha: movimiento.fecha_evento ? aHoraLocalChile(movimiento.fecha_evento) : '',
    sucursal: movimiento.sucursal_id,
  };
  const sinCambios = tipo === original.tipo && fecha === original.fecha && (necesitaSucursal ? sucursalId : null) === original.sucursal;

  async function guardar() {
    setIntento(true);
    if (errores.fecha || errores.sucursal || sinCambios || !movimiento.uuid_local) return;
    setGuardando(true);
    setError(null);
    try {
      await corregirMovimiento(movimiento.uuid_local, {
        tipo,
        fecha_evento: desdeHoraLocalChile(fecha),
        sucursal_id: necesitaSucursal ? sucursalId : null,
      });
      onGuardado();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const propias = auditoria.filter((a) => a.movimiento_uuid === movimiento.uuid_local);

  return (
    <Cajon
      abierto
      titulo={puedeEditar ? 'Corregir movimiento' : 'Correcciones del movimiento'}
      subtitulo={`${movimiento.tipo ? NOMBRE_TIPO[movimiento.tipo] : ''} de ${serie} · registrado por ${movimiento.tecnico_nombre ?? '—'}`}
      onCerrar={onCerrar}
      ocupado={guardando}
    >
      <div className="mb-5 rounded-md border border-gris-200 bg-gris-50 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gris-500">Registrado</p>
        <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1">
          <dt className="text-gris-500">Tipo</dt>
          <dd className="font-medium text-gris-900">{movimiento.tipo ? NOMBRE_TIPO[movimiento.tipo] : '—'}</dd>
          <dt className="text-gris-500">Fecha y hora</dt>
          <dd className="font-medium tabular-nums text-gris-900">{formatoFechaHora(movimiento.fecha_evento)}</dd>
          <dt className="text-gris-500">Cliente</dt>
          <dd className="font-medium text-gris-900">
            {movimiento.cliente_nombre ? `${movimiento.cliente_nombre} · ${movimiento.sucursal_nombre}` : '— (carga al camión)'}
          </dd>
          <dt className="text-gris-500">Camión</dt>
          <dd className="font-medium text-gris-900">{movimiento.patente ?? '—'}</dd>
        </dl>
      </div>

      {puedeEditar ? (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-azul-700">Corrección</p>
          <fieldset disabled={guardando} className="flex flex-col gap-4">
            <Campo etiqueta="Tipo">
              {(id) => (
                <select id={id} className={claseCampo} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {NOMBRE_TIPO[t]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo etiqueta="Fecha y hora del evento (hora de Chile)" error={intento ? errores.fecha : null}>
              {(id) => <input id={id} type="datetime-local" className={claseCampo} value={fecha} onChange={(e) => setFecha(e.target.value)} />}
            </Campo>
            {necesitaSucursal ? (
              <Campo
                etiqueta="Cliente y sucursal"
                error={intento ? errores.sucursal : null}
                ayuda={sucursalId ? `Elegida: ${nombreSucursal(sucursalId)}` : 'Busca por nombre del cliente, RUT o sucursal.'}
              >
                {(id) => (
                  <div className="flex flex-col gap-2">
                    <input
                      id={id}
                      type="search"
                      className={claseCampo}
                      placeholder={sucursales ? 'Buscar cliente o sucursal…' : 'Cargando sucursales…'}
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      autoComplete="off"
                    />
                    {filtradas.length ? (
                      <ul className="max-h-48 overflow-y-auto rounded-md border border-gris-200">
                        {filtradas.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSucursalId(s.id);
                                setBusqueda('');
                              }}
                              className={`block w-full px-3 py-2 text-left text-sm hover:bg-azul-50 ${s.id === sucursalId ? 'bg-azul-50 font-semibold' : ''}`}
                            >
                              {s.cliente} · {s.nombre}
                              <span className="block text-xs text-gris-500">{s.rut}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </Campo>
            ) : (
              <p className="text-xs text-gris-500">Una carga ocurre en planta: no lleva cliente.</p>
            )}
          </fieldset>
          <p className="rounded-md bg-alerta-fondo p-3 text-xs text-alerta">
            Al guardar queda registrado quién hizo el cambio y cuándo, con los datos de antes y de después. La ubicación del cilindro se vuelve a
            calcular y el informe de arriendo usará los datos corregidos. Un movimiento no se borra: se corrige.
          </p>
          <ErrorFormulario mensaje={error} />
          {intento && sinCambios ? <p className="text-xs text-gris-500">No cambiaste nada todavía.</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-8 border-t border-gris-200 pt-5">
        <h3 className="text-sm font-bold text-gris-900">Correcciones anteriores</h3>
        {propias.length === 0 ? (
          <p className="mt-2 text-sm text-gris-500">Este movimiento no ha sido corregido.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {propias.map((a) => (
              <li key={a.id} className="rounded-md border border-gris-200 p-3 text-sm">
                <p className="font-medium text-gris-900">
                  {formatoFechaHora(a.cambiado_en)} · {a.cambiado_por ? (nombres.get(a.cambiado_por) ?? 'usuario') : 'sistema'}
                </p>
                <p className="text-xs text-gris-500">{cambios(a.datos_antes, a.datos_despues, nombreSucursal).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Cajon>
  );
}
