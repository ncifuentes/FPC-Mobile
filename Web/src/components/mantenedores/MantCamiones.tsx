import { useCallback, useEffect, useState } from 'react';
import { guardarCamion, listarCamiones, normalizarPatente, nulo, patenteConFormatoChileno, type Camion } from '../../lib/mantenedores';
import { Aviso, botonPrimario, botonSecundario, Cajon, Campo, claseCampo, ErrorFormulario, EstadoActivo, Interruptor } from './ui';

/** Vehículos de reparto: patente, descripción y capacidad. */
export default function MantCamiones({ puedeEditar }: { puedeEditar: boolean }) {
  const [camiones, setCamiones] = useState<Camion[] | null>(null);
  const [error, setError] = useState(false);
  const [editando, setEditando] = useState<Camion | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarCamiones()
      .then((c) => {
        setCamiones(c);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(cargar, [cargar]);

  return (
    <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gris-200 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-gris-900">Camiones</h2>
          <p className="text-xs text-gris-500">El técnico registra cada movimiento en el camión que tiene asignado ese día.</p>
        </div>
        {puedeEditar ? (
          <button type="button" className={botonPrimario} onClick={() => setEditando('nuevo')}>
            + Nuevo camión
          </button>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudo cargar la lista de camiones.
        </p>
      ) : !camiones ? (
        <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gris-500">
              <tr>
                <th className="px-5 py-3 font-medium">Patente</th>
                <th className="px-3 py-3 font-medium">Descripción</th>
                <th className="px-3 py-3 text-right font-medium">Capacidad</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {camiones.map((c) => (
                <tr key={c.id} className="hover:bg-gris-50">
                  <td className="px-5 py-2.5 font-semibold tabular-nums text-gris-900">{c.patente}</td>
                  <td className="px-3 py-2.5 text-gris-700">{c.descripcion ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gris-700">{c.capacidad_cilindros} cilindros</td>
                  <td className="px-3 py-2.5">
                    <EstadoActivo activo={c.activo} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {puedeEditar ? (
                      <button type="button" className="text-sm font-semibold text-azul-700 hover:underline" onClick={() => setEditando(c)}>
                        Editar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando ? (
        <EditorCamion
          camion={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(nuevo, p) => {
            setEditando(null);
            cargar();
            setAviso(nuevo ? `Camión ${p} agregado.` : 'Cambios guardados.');
          }}
        />
      ) : null}
      <Aviso texto={aviso} onCerrar={() => setAviso(null)} />
    </section>
  );
}

function EditorCamion({ camion, onCerrar, onGuardado }: { camion: Camion | null; onCerrar: () => void; onGuardado: (nuevo: boolean, patente: string) => void }) {
  const [patente, setPatente] = useState(camion?.patente ?? '');
  const [descripcion, setDescripcion] = useState(camion?.descripcion ?? '');
  const [capacidad, setCapacidad] = useState(String(camion?.capacidad_cilindros ?? ''));
  const [activo, setActivo] = useState(camion?.activo ?? true);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = normalizarPatente(patente);
  const cap = Number(capacidad);
  const errores = {
    patente: p ? null : 'Escribe la patente.',
    capacidad: Number.isInteger(cap) && cap > 0 && cap <= 1000 ? null : 'Indica cuántos cilindros caben (un número entero mayor que cero).',
  };

  async function guardar() {
    setIntento(true);
    if (errores.patente || errores.capacidad) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarCamion({ id: camion?.id, patente: p, descripcion: nulo(descripcion), capacidad_cilindros: cap, activo });
      onGuardado(!camion, p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Cajon abierto titulo={camion ? 'Editar camión' : 'Nuevo camión'} subtitulo={camion?.patente} onCerrar={onCerrar} ocupado={guardando}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <fieldset disabled={guardando} className="flex flex-col gap-4">
          <Campo
            etiqueta="Patente"
            obligatorio
            error={intento ? errores.patente : null}
            ayuda={
              p && !patenteConFormatoChileno(p)
                ? `Se guardará como ${p}. Ojo: no tiene el formato chileno habitual (AB1234 o BCDF12).`
                : p && p !== patente
                  ? `Se guardará como ${p}.`
                  : 'Sin guion ni espacios.'
            }
          >
            {(id) => <input id={id} className={claseCampo} value={patente} onChange={(e) => setPatente(e.target.value)} autoComplete="off" />}
          </Campo>
          <Campo etiqueta="Descripción" ayuda="Por ejemplo «Camión 3/4 Hyundai» o «Camioneta».">
            {(id) => <input id={id} className={claseCampo} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
          </Campo>
          <Campo etiqueta="Capacidad (cilindros)" obligatorio error={intento ? errores.capacidad : null}>
            {(id) => (
              <input id={id} type="number" min={1} max={1000} step={1} className={claseCampo} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
            )}
          </Campo>
          <Interruptor
            etiqueta="Camión activo"
            ayuda="Uno de baja no se puede asignar a técnicos. Sus movimientos pasados se conservan."
            marcado={activo}
            onCambiar={setActivo}
          />
        </fieldset>
        <ErrorFormulario mensaje={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={botonSecundario} onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className={botonPrimario} disabled={guardando}>
            {guardando ? 'Guardando…' : camion ? 'Guardar cambios' : 'Agregar camión'}
          </button>
        </div>
      </form>
    </Cajon>
  );
}
