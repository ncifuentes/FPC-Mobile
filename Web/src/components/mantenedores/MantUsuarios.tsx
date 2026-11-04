import { useCallback, useEffect, useMemo, useState } from 'react';
import { guardarUsuario, listarCamiones, listarUsuarios, type Camion, type Cuenta, type Rol, type Usuario } from '../../lib/mantenedores';
import { NOMBRE_ROL } from '../../lib/sesion';
import { formatoFechaHora } from '../../lib/formato';
import { Aviso, botonPrimario, botonSecundario, Cajon, Campo, claseCampo, ErrorFormulario, EstadoActivo, Interruptor } from './ui';

const ROLES: Rol[] = ['tecnico', 'admin', 'gerente'];
const AYUDA_ROL: Record<Rol, string> = {
  tecnico: 'Usa la app móvil: carga, entrega y retiro. Ve solo sus propios movimientos.',
  admin: 'Usa la plataforma web y puede modificar todo.',
  gerente: 'Usa la plataforma web en modo solo lectura.',
};
const COLOR_ROL: Record<Rol, string> = {
  tecnico: 'bg-azul-100 text-azul-700',
  admin: 'bg-verde-100 text-verde-700',
  gerente: 'bg-gris-100 text-gris-700',
};

/**
 * Usuarios (HU-14): rol y camión de cada persona. Las cuentas de acceso (correo y contraseña)
 * se crean en el panel de Supabase; aquí se les asigna el perfil.
 */
export default function MantUsuarios({ puedeEditar, miId }: { puedeEditar: boolean; miId: string }) {
  const [datos, setDatos] = useState<{ usuarios: Usuario[]; cuentas: Cuenta[]; camiones: Camion[] } | null>(null);
  const [error, setError] = useState(false);
  const [editando, setEditando] = useState<{ usuario: Usuario; nuevo: boolean; correo: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    Promise.all([listarUsuarios(), listarCamiones()])
      .then(([u, camiones]) => {
        setDatos({ ...u, camiones });
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(cargar, [cargar]);

  const correo = useMemo(() => new Map((datos?.cuentas ?? []).map((c) => [c.id, c])), [datos]);
  const patente = useMemo(() => new Map((datos?.camiones ?? []).map((c) => [c.id, c.patente])), [datos]);
  const sinPerfil = (datos?.cuentas ?? []).filter((c) => !c.tiene_perfil);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
        <header className="border-b border-gris-200 px-5 py-4">
          <h2 className="text-base font-bold text-gris-900">Usuarios con perfil</h2>
          <p className="text-xs text-gris-500">Dar de baja a alguien le impide entrar a la app y a la web, sin borrar lo que registró.</p>
        </header>
        {error ? (
          <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
            No se pudo cargar la lista de usuarios.
          </p>
        ) : !datos ? (
          <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gris-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Correo</th>
                  <th className="px-3 py-3 font-medium">Rol</th>
                  <th className="px-3 py-3 font-medium">Camión</th>
                  <th className="px-3 py-3 font-medium">Último ingreso</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gris-100">
                {datos.usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gris-50">
                    <td className="px-5 py-2.5 font-medium text-gris-900">
                      {u.nombre}
                      {u.id === miId ? <span className="ml-2 text-xs font-normal text-gris-500">(tú)</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-gris-700">{correo.get(u.id)?.correo ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ROL[u.rol]}`}>{NOMBRE_ROL[u.rol]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gris-700">
                      {u.rol === 'tecnico' ? (u.camion_jornada_id ? patente.get(u.camion_jornada_id) : <span className="text-alerta">Sin camión</span>) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gris-500">{formatoFechaHora(correo.get(u.id)?.ultimo_ingreso ?? null)}</td>
                    <td className="px-3 py-2.5">
                      <EstadoActivo activo={u.activo} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {puedeEditar ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-azul-700 hover:underline"
                          onClick={() => setEditando({ usuario: u, nuevo: false, correo: correo.get(u.id)?.correo ?? '' })}
                        >
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
      </section>

      <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
        <header className="border-b border-gris-200 px-5 py-4">
          <h2 className="text-base font-bold text-gris-900">Cuentas sin perfil</h2>
          <p className="text-xs text-gris-500">
            Una cuenta nueva se crea en el panel de Supabase (<em>Authentication → Users → Add user</em>), con el correo y una contraseña
            inicial. Después aparece aquí para asignarle nombre, rol y camión. Sin perfil, la cuenta no puede entrar a nada.
          </p>
        </header>
        {!datos ? null : sinPerfil.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gris-500">Todas las cuentas tienen perfil.</p>
        ) : (
          <ul className="divide-y divide-gris-100">
            {sinPerfil.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <span className="font-medium text-gris-900">{c.correo}</span>
                  <span className="block text-xs text-gris-500">Creada el {formatoFechaHora(c.creada_en)}</span>
                </span>
                {puedeEditar ? (
                  <button
                    type="button"
                    className={botonPrimario}
                    onClick={() =>
                      setEditando({
                        usuario: { id: c.id, nombre: '', rol: 'tecnico', camion_jornada_id: null, activo: true },
                        nuevo: true,
                        correo: c.correo,
                      })
                    }
                  >
                    Crear perfil
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editando && datos ? (
        <EditorUsuario
          {...editando}
          camiones={datos.camiones}
          esUnoMismo={editando.usuario.id === miId}
          onCerrar={() => setEditando(null)}
          onGuardado={(nombre) => {
            setEditando(null);
            cargar();
            setAviso(editando.nuevo ? `Perfil de ${nombre} creado.` : 'Cambios guardados.');
          }}
        />
      ) : null}
      <Aviso texto={aviso} onCerrar={() => setAviso(null)} />
    </div>
  );
}

function EditorUsuario({
  usuario,
  nuevo,
  correo,
  camiones,
  esUnoMismo,
  onCerrar,
  onGuardado,
}: {
  usuario: Usuario;
  nuevo: boolean;
  correo: string;
  camiones: Camion[];
  esUnoMismo: boolean;
  onCerrar: () => void;
  onGuardado: (nombre: string) => void;
}) {
  const [u, setU] = useState(usuario);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorNombre = u.nombre.trim() ? null : 'Escribe el nombre de la persona.';
  const camionesActivos = camiones.filter((c) => c.activo || c.id === u.camion_jornada_id);

  async function guardar() {
    setIntento(true);
    if (errorNombre) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarUsuario(u, nuevo);
      onGuardado(u.nombre.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Cajon abierto titulo={nuevo ? 'Crear perfil' : 'Editar usuario'} subtitulo={correo} onCerrar={onCerrar} ocupado={guardando}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <fieldset disabled={guardando} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre" obligatorio error={intento ? errorNombre : null}>
            {(id) => <input id={id} className={claseCampo} value={u.nombre} onChange={(e) => setU({ ...u, nombre: e.target.value })} />}
          </Campo>
          <Campo
            etiqueta="Rol"
            ayuda={esUnoMismo ? 'No puedes cambiar tu propio rol: pídeselo a otro administrador.' : AYUDA_ROL[u.rol]}
          >
            {(id) => (
              <select
                id={id}
                className={claseCampo}
                value={u.rol}
                disabled={esUnoMismo}
                onChange={(e) => setU({ ...u, rol: e.target.value as Rol })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {NOMBRE_ROL[r]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          {u.rol === 'tecnico' ? (
            <Campo etiqueta="Camión de la jornada" ayuda="El vehículo con el que trabaja; la app lo usa en cada movimiento. Se puede cambiar cada día.">
              {(id) => (
                <select
                  id={id}
                  className={claseCampo}
                  value={u.camion_jornada_id ?? ''}
                  onChange={(e) => setU({ ...u, camion_jornada_id: e.target.value || null })}
                >
                  <option value="">Sin camión asignado</option>
                  {camionesActivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.patente}
                      {c.descripcion ? ` · ${c.descripcion}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          ) : null}
          <Interruptor
            etiqueta="Usuario activo"
            ayuda={esUnoMismo ? 'No puedes darte de baja a ti mismo.' : 'Si lo das de baja, no podrá iniciar sesión.'}
            marcado={u.activo}
            deshabilitado={esUnoMismo}
            onCambiar={(v) => setU({ ...u, activo: v })}
          />
        </fieldset>
        <ErrorFormulario mensaje={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={botonSecundario} onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className={botonPrimario} disabled={guardando}>
            {guardando ? 'Guardando…' : nuevo ? 'Crear perfil' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Cajon>
  );
}
