import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buscarCilindrosMant,
  guardarCilindro,
  listarProductos,
  nulo,
  POR_PAGINA_CILINDROS,
  type CilindroMant,
  type Producto,
} from '../../lib/mantenedores';
import { urlFicha } from '../../lib/cilindros';
import { NOMBRE_ESTADO, numero } from '../../lib/formato';
import { COLOR_ESTADO } from '../../lib/estilos';
import { Aviso, botonPrimario, botonSecundario, Cajon, Campo, claseCampo, ErrorFormulario, EstadoActivo, Interruptor } from './ui';

/** Parque de cilindros (HU-13): alta y edición de envases. */
export default function MantCilindros({ puedeEditar }: { puedeEditar: boolean }) {
  const [busqueda, setBusqueda] = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [resultado, setResultado] = useState<{ filas: CilindroMant[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [editando, setEditando] = useState<CilindroMant | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const primera = useRef(true);

  useEffect(() => {
    listarProductos()
      .then(setProductos)
      .catch(() => setProductos([]));
  }, []);

  useEffect(() => {
    let vigente = true;
    const t = window.setTimeout(
      () => {
        buscarCilindrosMant(busqueda, !verBajas, pagina)
          .then((r) => {
            if (vigente) {
              setResultado(r);
              setError(false);
            }
          })
          .catch(() => vigente && setError(true));
      },
      primera.current ? 0 : 250,
    );
    primera.current = false;
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [busqueda, verBajas, pagina, version]);

  const paginas = resultado ? Math.max(1, Math.ceil(resultado.total / POR_PAGINA_CILINDROS)) : 1;

  return (
    <section className="rounded-lg border border-gris-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-gris-200 px-5 py-4 sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Buscar cilindro"
          placeholder="Buscar N° de serie…"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(0);
          }}
          className={`${claseCampo} sm:max-w-sm`}
        />
        <label className="flex items-center gap-2 text-sm text-gris-700">
          <input
            type="checkbox"
            checked={verBajas}
            onChange={(e) => {
              setVerBajas(e.target.checked);
              setPagina(0);
            }}
            className="size-4 accent-azul-700"
          />
          Mostrar dados de baja
        </label>
        {puedeEditar ? (
          <button type="button" className={`${botonPrimario} sm:ml-auto`} onClick={() => setEditando('nuevo')}>
            + Nuevo cilindro
          </button>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="m-5 rounded-md bg-error-fondo p-4 text-sm text-error">
          No se pudo cargar el parque.
        </p>
      ) : !resultado ? (
        <p className="px-5 py-8 text-sm text-gris-500">Cargando…</p>
      ) : resultado.filas.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gris-500">Ningún cilindro coincide.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gris-500">
              <tr>
                <th className="px-5 py-3 font-medium">N° de serie</th>
                <th className="px-3 py-3 font-medium">Producto</th>
                <th className="px-3 py-3 font-medium">Depósito</th>
                <th className="px-3 py-3 font-medium">Ubicación</th>
                <th className="px-3 py-3 font-medium">Estado</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {resultado.filas.map((c) => (
                <tr key={c.id} className="hover:bg-gris-50">
                  <td className="px-5 py-2.5">
                    <a href={urlFicha(c.numero_serie)} className="font-medium text-azul-700 hover:underline">
                      {c.numero_serie}
                    </a>
                    {c.codigo_barras ? <span className="block text-xs text-gris-500">{c.codigo_barras}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-gris-700">
                    {c.productos?.nombre}
                    <span className="ml-2 text-xs text-gris-500">{c.productos?.envase_codigo}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gris-700">{c.deposito ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_ESTADO[c.estado]}`}>{NOMBRE_ESTADO[c.estado]}</span>
                  </td>
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
        </div>
      )}

      {resultado && resultado.total > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gris-200 px-5 py-3 text-sm text-gris-500">
          <span>
            {numero.format(pagina * POR_PAGINA_CILINDROS + 1)}–{numero.format(Math.min((pagina + 1) * POR_PAGINA_CILINDROS, resultado.total))} de{' '}
            {numero.format(resultado.total)}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className={botonSecundario}>
              ‹ Anterior
            </button>
            <span className="tabular-nums">
              {pagina + 1} / {paginas}
            </span>
            <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)} className={botonSecundario}>
              Siguiente ›
            </button>
          </span>
        </footer>
      ) : null}

      {editando ? (
        <EditorCilindro
          cilindro={editando === 'nuevo' ? null : editando}
          productos={productos}
          puedeEditar={puedeEditar}
          onCerrar={() => setEditando(null)}
          onGuardado={(nuevo, serie) => {
            setEditando(null);
            setVersion((v) => v + 1);
            setAviso(nuevo ? `Cilindro ${serie} agregado al parque (en planta).` : 'Cambios guardados.');
          }}
        />
      ) : null}
      <Aviso texto={aviso} onCerrar={() => setAviso(null)} />
    </section>
  );
}

function EditorCilindro({
  cilindro,
  productos,
  puedeEditar,
  onCerrar,
  onGuardado,
}: {
  cilindro: CilindroMant | null;
  productos: Producto[];
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: (nuevo: boolean, serie: string) => void;
}) {
  const [serie, setSerie] = useState(cilindro?.numero_serie ?? '');
  const [barras, setBarras] = useState(cilindro?.codigo_barras ?? '');
  const [productoId, setProductoId] = useState(cilindro?.producto_id ?? '');
  const [deposito, setDeposito] = useState(cilindro?.deposito ?? '');
  const [activo, setActivo] = useState(cilindro?.activo ?? true);
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordenados = useMemo(
    () => [...productos].filter((p) => p.activo || p.id === productoId).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos, productoId],
  );
  const producto = productos.find((p) => p.id === productoId);
  const esPro = producto?.envase_codigo === 'PRO';
  const errores = {
    serie: serie.trim() ? null : 'Escribe el número de serie grabado en el envase.',
    producto: productoId ? null : 'Elige el tipo de envase.',
  };

  async function guardar() {
    setIntento(true);
    if (errores.serie || errores.producto) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarCilindro(
        { id: cilindro?.id, numero_serie: serie, codigo_barras: nulo(barras), producto_id: productoId, deposito: nulo(deposito.toUpperCase()), activo },
        esPro,
      );
      onGuardado(!cilindro, serie.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Cajon
      abierto
      titulo={cilindro ? (puedeEditar ? 'Editar cilindro' : 'Cilindro') : 'Nuevo cilindro'}
      subtitulo={cilindro?.numero_serie}
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
          <Campo
            etiqueta="N° de serie"
            obligatorio
            error={intento ? errores.serie : null}
            ayuda={cilindro ? 'Cambiarlo afecta cómo lo encuentra el técnico al escanear o tipear.' : 'Tal como está grabado en el envase.'}
          >
            {(id) => <input id={id} className={claseCampo} value={serie} onChange={(e) => setSerie(e.target.value)} autoComplete="off" />}
          </Campo>
          <Campo etiqueta="Tipo de envase (producto)" obligatorio error={intento ? errores.producto : null}>
            {(id) => (
              <select id={id} className={claseCampo} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                <option value="">Elegir…</option>
                {ordenados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.envase_codigo}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          {esPro ? (
            <p className="rounded-md bg-azul-50 p-3 text-xs text-azul-800">
              Categoría PRO: el envase se rastrea pero <strong>no se cobra arriendo</strong> (decisión del 27-10).
            </p>
          ) : null}
          <Campo etiqueta="Depósito" ayuda="Bodega física donde está el envase (por ejemplo FP o LI). No indica de quién es.">
            {(id) => <input id={id} className={claseCampo} value={deposito} onChange={(e) => setDeposito(e.target.value)} maxLength={10} />}
          </Campo>
          <Campo etiqueta="Código de barras" ayuda="Solo si el envase tiene una etiqueta distinta del número de serie.">
            {(id) => <input id={id} className={claseCampo} value={barras} onChange={(e) => setBarras(e.target.value)} autoComplete="off" />}
          </Campo>
          <Interruptor
            etiqueta="Cilindro activo"
            ayuda="Un cilindro de baja (perdido, fuera de servicio) deja de contarse en el parque y en los listados de la web. Su historial se conserva."
            marcado={activo}
            onCambiar={setActivo}
          />
          {cilindro ? (
            <p className="text-xs text-gris-500">
              Ubicación actual: <strong>{NOMBRE_ESTADO[cilindro.estado]}</strong>. La calcula el sistema a partir de los movimientos; no se edita
              aquí. Si un movimiento está mal, corrígelo desde la ficha del cilindro.
            </p>
          ) : (
            <p className="text-xs text-gris-500">El cilindro nuevo queda en planta hasta que el técnico registre su primera carga.</p>
          )}
        </fieldset>
        <ErrorFormulario mensaje={error} />
        {puedeEditar ? (
          <div className="flex justify-end gap-2">
            <button type="button" className={botonSecundario} onClick={onCerrar} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className={botonPrimario} disabled={guardando}>
              {guardando ? 'Guardando…' : cilindro ? 'Guardar cambios' : 'Agregar cilindro'}
            </button>
          </div>
        ) : null}
      </form>
    </Cajon>
  );
}
