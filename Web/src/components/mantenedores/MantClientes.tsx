import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  guardarCliente,
  guardarSucursal,
  listarClientes,
  listarSucursales,
  normalizarRut,
  nulo,
  REGIONES,
  validarRut,
  type Cliente,
  type Sucursal,
} from '../../lib/mantenedores';
import { coincide, textoBuscable, urlFichaCliente } from '../../lib/clientes';
import { numero } from '../../lib/formato';
import { Aviso, botonPrimario, botonSecundario, Cajon, Campo, claseCampo, ErrorFormulario, EstadoActivo, Interruptor } from './ui';

type ClienteFila = Cliente & { sucursales: number };

/** Clientes y sus sucursales (HU-12). */
export default function MantClientes({ puedeEditar }: { puedeEditar: boolean }) {
  const [clientes, setClientes] = useState<ClienteFila[] | null>(null);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [editando, setEditando] = useState<Cliente | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarClientes()
      .then((c) => {
        setClientes(c);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(cargar, [cargar]);

  const visibles = useMemo(
    () =>
      (clientes ?? []).filter(
        (c) => (verBajas || c.activo) && (!busqueda.trim() || coincide(textoBuscable(c.nombre, c.rut, c.codigo_kame), busqueda)),
      ),
    [clientes, busqueda, verBajas],
  );

  return (
    <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-gris-200 px-5 py-4 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Buscar cliente"
          placeholder="Buscar por nombre, RUT o código KAME…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className={`${claseCampo} sm:max-w-sm`}
        />
        <label className="flex items-center gap-2 text-sm text-gris-700">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="size-4 accent-azul-700" />
          Mostrar dados de baja
        </label>
        {puedeEditar ? (
          <button type="button" className={`${botonPrimario} sm:ml-auto`} onClick={() => setEditando('nuevo')}>
            + Nuevo cliente
          </button>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudo cargar la lista de clientes.
        </p>
      ) : !clientes ? (
        <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gris-500">
              <tr>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 font-medium">RUT</th>
                <th className="px-3 py-3 font-medium">Código KAME</th>
                <th className="px-3 py-3 text-right font-medium">Sucursales</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {visibles.map((c) => (
                <tr key={c.id} className="hover:bg-gris-50">
                  <td className="px-5 py-2.5">
                    <a href={urlFichaCliente(c.id)} className="font-medium text-azul-700 hover:underline">
                      {c.nombre}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gris-700">{c.rut}</td>
                  <td className="px-3 py-2.5 text-gris-700">{c.codigo_kame ?? <span className="text-gris-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gris-700">{c.sucursales}</td>
                  <td className="px-3 py-2.5">
                    <EstadoActivo activo={c.activo} />
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className="text-sm font-semibold text-azul-700 hover:underline" onClick={() => setEditando(c)}>
                      {puedeEditar ? 'Editar' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 ? <p className="px-5 py-8 text-sm text-gris-500">Ningún cliente coincide.</p> : null}
        </div>
      )}
      {clientes ? (
        <footer className="border-t border-gris-200 px-5 py-3 text-sm text-gris-500">
          {numero.format(visibles.length)} de {numero.format(clientes.length)} clientes
        </footer>
      ) : null}

      {editando ? (
        <EditorCliente
          cliente={editando === 'nuevo' ? null : editando}
          puedeEditar={puedeEditar}
          onCerrar={() => setEditando(null)}
          onGuardado={(c, nuevo) => {
            cargar();
            setAviso(nuevo ? `Cliente «${c.nombre}» creado. Agrégale al menos una sucursal.` : 'Cambios guardados.');
            setEditando(c);
          }}
          onCambioSucursales={cargar}
        />
      ) : null}
      <Aviso texto={aviso} onCerrar={() => setAviso(null)} />
    </section>
  );
}

function EditorCliente({
  cliente,
  puedeEditar,
  onCerrar,
  onGuardado,
  onCambioSucursales,
}: {
  cliente: Cliente | null;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: (c: Cliente, nuevo: boolean) => void;
  onCambioSucursales: () => void;
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [rut, setRut] = useState(cliente?.rut ?? '');
  const [kame, setKame] = useState(cliente?.codigo_kame ?? '');
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al pasar de «nuevo» a recién creado, el formulario toma los datos guardados.
  useEffect(() => {
    setNombre(cliente?.nombre ?? '');
    setRut(cliente?.rut ?? '');
    setKame(cliente?.codigo_kame ?? '');
    setActivo(cliente?.activo ?? true);
    setIntento(false);
    setError(null);
  }, [cliente]);

  const rutNormal = normalizarRut(rut);
  const errorRut = validarRut(rutNormal);
  const errorNombre = nombre.trim() ? null : 'Escribe el nombre o razón social.';
  const valido = !errorRut && !errorNombre;

  async function guardar() {
    setIntento(true);
    if (!valido) return;
    setGuardando(true);
    setError(null);
    try {
      const c = await guardarCliente({ id: cliente?.id, nombre, rut: rutNormal, codigo_kame: nulo(kame), activo });
      onGuardado(c, !cliente);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Cajon
      abierto
      titulo={cliente ? (puedeEditar ? 'Editar cliente' : 'Cliente') : 'Nuevo cliente'}
      subtitulo={cliente?.nombre}
      onCerrar={onCerrar}
      ocupado={guardando}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <fieldset disabled={!puedeEditar || guardando} className="flex flex-col gap-4">
          <Campo etiqueta="Nombre o razón social" obligatorio error={intento ? errorNombre : null}>
            {(id) => <input id={id} className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} />}
          </Campo>
          <Campo
            etiqueta="RUT"
            obligatorio
            error={intento || rut.length > 3 ? errorRut : null}
            ayuda={rut && rutNormal !== rut ? `Se guardará como ${rutNormal}` : 'Con o sin puntos; se guarda sin puntos y con guion.'}
          >
            {(id) => (
              <input id={id} className={claseCampo} value={rut} onChange={(e) => setRut(e.target.value)} placeholder="76.123.456-7" inputMode="text" />
            )}
          </Campo>
          <Campo etiqueta="Código KAME" ayuda="Código interno del cliente en KAME ONE. Opcional por ahora.">
            {(id) => <input id={id} className={claseCampo} value={kame} onChange={(e) => setKame(e.target.value)} />}
          </Campo>
          <Interruptor
            etiqueta="Cliente activo"
            ayuda="Un cliente dado de baja no aparece en la app del técnico. Su historial se conserva."
            marcado={activo}
            onCambiar={setActivo}
          />
        </fieldset>
        <ErrorFormulario mensaje={error} />
        {puedeEditar ? (
          <div className="flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={onCerrar} disabled={guardando}>
              Cerrar
            </button>
            <button type="submit" className={botonPrimario} disabled={guardando}>
              {guardando ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        ) : null}
      </form>

      {cliente ? <Sucursales cliente={cliente} puedeEditar={puedeEditar} onCambio={onCambioSucursales} /> : null}
    </Cajon>
  );
}

const SUCURSAL_VACIA = {
  nombre: '',
  direccion: '',
  comuna: '',
  ciudad: '',
  region: '',
  contacto: '',
  telefono: '',
  email: '',
  es_principal: false,
  activo: true,
};

function Sucursales({ cliente, puedeEditar, onCambio }: { cliente: Cliente; puedeEditar: boolean; onCambio: () => void }) {
  const [lista, setLista] = useState<Sucursal[] | null>(null);
  const [editando, setEditando] = useState<Sucursal | 'nueva' | null>(null);

  const cargar = useCallback(() => {
    listarSucursales(cliente.id)
      .then(setLista)
      .catch(() => setLista([]));
  }, [cliente.id]);
  useEffect(cargar, [cargar]);

  return (
    <div className="mt-8 border-t border-gris-200 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-gris-900">Sucursales</h3>
        {puedeEditar && editando === null ? (
          <button type="button" className="text-sm font-semibold text-azul-700 hover:underline" onClick={() => setEditando('nueva')}>
            + Agregar sucursal
          </button>
        ) : null}
      </div>

      {editando ? (
        <EditorSucursal
          clienteId={cliente.id}
          sucursal={editando === 'nueva' ? null : editando}
          esPrimera={(lista?.length ?? 0) === 0}
          onCancelar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            cargar();
            onCambio();
          }}
        />
      ) : null}

      {!lista ? (
        <p className="text-sm text-gris-500">Cargando…</p>
      ) : lista.length === 0 && !editando ? (
        <p className="rounded-md border border-dashed border-alerta bg-alerta-fondo p-3 text-sm text-alerta">
          Este cliente no tiene sucursales: el técnico no podrá registrarle entregas hasta que tenga al menos una.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((s) => (
            <li key={s.id} className={`rounded-md border border-gris-200 p-3 ${s.activo ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gris-900">
                    {s.nombre}
                    {s.es_principal ? <span className="ml-2 text-xs font-medium text-azul-700">principal</span> : null}
                    {!s.activo ? <span className="ml-2 text-xs font-medium text-gris-500">de baja</span> : null}
                  </p>
                  <p className="text-sm text-gris-700">{s.direccion}</p>
                  <p className="text-xs text-gris-500">{[s.comuna, s.ciudad, s.region].filter(Boolean).join(', ')}</p>
                  {s.contacto || s.telefono || s.email ? (
                    <p className="mt-1 truncate text-xs text-gris-500">{[s.contacto, s.telefono, s.email].filter(Boolean).join(' · ')}</p>
                  ) : null}
                </div>
                {puedeEditar && editando === null ? (
                  <button type="button" className="shrink-0 text-sm font-semibold text-azul-700 hover:underline" onClick={() => setEditando(s)}>
                    Editar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditorSucursal({
  clienteId,
  sucursal,
  esPrimera,
  onCancelar,
  onGuardada,
}: {
  clienteId: string;
  sucursal: Sucursal | null;
  esPrimera: boolean;
  onCancelar: () => void;
  onGuardada: () => void;
}) {
  const [f, setF] = useState(() =>
    sucursal
      ? {
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          comuna: sucursal.comuna ?? '',
          ciudad: sucursal.ciudad ?? '',
          region: sucursal.region ?? '',
          contacto: sucursal.contacto ?? '',
          telefono: sucursal.telefono ?? '',
          email: sucursal.email ?? '',
          es_principal: sucursal.es_principal,
          activo: sucursal.activo,
        }
      : { ...SUCURSAL_VACIA, nombre: esPrimera ? 'PRINCIPAL' : '', es_principal: esPrimera },
  );
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poner = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const errores = {
    nombre: f.nombre.trim() ? null : 'Ponle un nombre (por ejemplo PRINCIPAL o PLANTA MOLINA).',
    direccion: f.direccion.trim() ? null : 'La dirección es obligatoria: es donde el técnico entrega.',
    email: !f.email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? null : 'El correo no parece válido.',
  };
  const valido = !errores.nombre && !errores.direccion && !errores.email;

  async function guardar() {
    setIntento(true);
    if (!valido) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarSucursal({
        id: sucursal?.id,
        cliente_id: clienteId,
        nombre: f.nombre.trim().toUpperCase(),
        direccion: f.direccion.trim(),
        comuna: nulo(f.comuna),
        ciudad: nulo(f.ciudad),
        region: nulo(f.region),
        contacto: nulo(f.contacto),
        telefono: nulo(f.telefono),
        email: nulo(f.email.toLowerCase()),
        es_principal: f.es_principal,
        activo: f.activo,
      });
      onGuardada();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
        noValidate
      className="mb-4 flex flex-col gap-3 rounded-md border border-azul-200 bg-azul-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <p className="text-sm font-bold text-gris-900">{sucursal ? `Editar sucursal ${sucursal.nombre}` : 'Nueva sucursal'}</p>
      <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" obligatorio error={intento ? errores.nombre : null}>
          {(id) => <input id={id} className={claseCampo} value={f.nombre} onChange={poner('nombre')} />}
        </Campo>
        <Campo etiqueta="Región">
          {(id) => (
            <>
              <input id={id} list={`${id}-regiones`} className={claseCampo} value={f.region} onChange={poner('region')} />
              <datalist id={`${id}-regiones`}>
                {REGIONES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </>
          )}
        </Campo>
        <div className="sm:col-span-2">
          <Campo etiqueta="Dirección" obligatorio error={intento ? errores.direccion : null}>
            {(id) => <input id={id} className={claseCampo} value={f.direccion} onChange={poner('direccion')} />}
          </Campo>
        </div>
        <Campo etiqueta="Comuna">{(id) => <input id={id} className={claseCampo} value={f.comuna} onChange={poner('comuna')} />}</Campo>
        <Campo etiqueta="Ciudad">{(id) => <input id={id} className={claseCampo} value={f.ciudad} onChange={poner('ciudad')} />}</Campo>
        <Campo etiqueta="Contacto">{(id) => <input id={id} className={claseCampo} value={f.contacto} onChange={poner('contacto')} />}</Campo>
        <Campo etiqueta="Teléfono">
          {(id) => <input id={id} type="tel" className={claseCampo} value={f.telefono} onChange={poner('telefono')} />}
        </Campo>
        <div className="sm:col-span-2">
          <Campo etiqueta="Correo" error={errores.email} ayuda="A este correo llega el comprobante de cada entrega o retiro.">
            {(id) => <input id={id} type="email" className={claseCampo} value={f.email} onChange={poner('email')} />}
          </Campo>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Interruptor
            etiqueta="Sucursal principal"
            ayuda="Si la marcas, las demás sucursales del cliente dejan de ser principales."
            marcado={f.es_principal}
            onCambiar={(v) => setF({ ...f, es_principal: v })}
          />
          <Interruptor etiqueta="Sucursal activa" marcado={f.activo} onCambiar={(v) => setF({ ...f, activo: v })} />
        </div>
      </fieldset>
      <ErrorFormulario mensaje={error} />
      <div className="flex justify-end gap-2">
        <button type="button" className={botonSecundario} onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
        <button type="submit" className={botonPrimario} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar sucursal'}
        </button>
      </div>
    </form>
  );
}
