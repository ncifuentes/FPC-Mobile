/** Piezas de interfaz compartidas por los mantenedores: panel lateral, campos y botones. */
import { useEffect, useId, useRef, type ReactNode } from 'react';

export const claseCampo =
  'w-full rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900 disabled:bg-gris-50 disabled:text-gris-500';
export const claseBoton = 'rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';
export const botonPrimario = `${claseBoton} bg-azul-700 text-white hover:bg-azul-800`;
export const botonSecundario = `${claseBoton} border border-gris-300 bg-white text-gris-700 hover:bg-gris-50`;

/**
 * Panel lateral para crear o editar un registro. Se cierra con Escape o con el fondo, salvo
 * mientras se está guardando.
 */
export function Cajon({
  titulo,
  subtitulo,
  abierto,
  onCerrar,
  ocupado = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  abierto: boolean;
  onCerrar: () => void;
  ocupado?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ocupado) onCerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      anterior?.focus?.();
    };
  }, [abierto, ocupado, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-gris-900/30" onClick={() => !ocupado && onCerrar()} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gris-200 bg-white px-6 py-4">
          <div>
            <h2 id={idTitulo} className="text-lg font-bold text-gris-900">
              {titulo}
            </h2>
            {subtitulo ? <p className="text-sm text-gris-500">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={ocupado}
            aria-label="Cerrar"
            className="rounded-md px-2 py-1 text-xl leading-none text-gris-500 hover:bg-gris-100"
          >
            ×
          </button>
        </header>
        <div className="flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  obligatorio,
  children,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string | null;
  obligatorio?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-gris-700">
        {etiqueta}
        {obligatorio ? <span className="text-error"> *</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : ayuda ? (
        <p className="text-xs text-gris-500">{ayuda}</p>
      ) : null}
    </div>
  );
}

export function Interruptor({
  etiqueta,
  ayuda,
  marcado,
  onCambiar,
  deshabilitado,
}: {
  etiqueta: string;
  ayuda?: string;
  marcado: boolean;
  onCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm text-gris-900">
      <input
        type="checkbox"
        checked={marcado}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.checked)}
        className="mt-0.5 size-4 accent-azul-700"
      />
      <span>
        <span className="font-medium">{etiqueta}</span>
        {ayuda ? <span className="block text-xs text-gris-500">{ayuda}</span> : null}
      </span>
    </label>
  );
}

export function ErrorFormulario({ mensaje }: { mensaje: string | null }) {
  return mensaje ? (
    <p role="alert" className="rounded-md bg-error-fondo p-3 text-sm text-error">
      {mensaje}
    </p>
  ) : null;
}

export function EstadoActivo({ activo }: { activo: boolean }) {
  return activo ? (
    <span className="rounded-full bg-verde-100 px-2.5 py-0.5 text-xs font-semibold text-verde-700">Activo</span>
  ) : (
    <span className="rounded-full bg-gris-100 px-2.5 py-0.5 text-xs font-semibold text-gris-500">De baja</span>
  );
}

/** Aviso breve tras guardar. */
export function Aviso({ texto, onCerrar }: { texto: string | null; onCerrar: () => void }) {
  useEffect(() => {
    if (!texto) return;
    const t = window.setTimeout(onCerrar, 3500);
    return () => window.clearTimeout(t);
  }, [texto, onCerrar]);
  return texto ? (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-gris-900 px-4 py-2 text-sm text-white shadow-lg">
      {texto}
    </div>
  ) : null;
}
