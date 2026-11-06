import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type SubmitEvent } from 'react';
import { obtenerPerfil, type Perfil } from '../lib/sesion';
import { preguntar, type MensajeChat } from '../lib/asistente';
import AvatarUsuario from './AvatarUsuario';
import { botonPrimario, botonSecundario, claseCampo } from './mantenedores/ui';
import TextoConFormato from './TextoConFormato';

const MAX_PREGUNTA = 2000;

/** Las preguntas de la demo, como sugerencias cuando la conversación está vacía. */
function sugerencias(): string[] {
  const mes = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', month: 'long' }).format(new Date());
  return [
    '¿Dónde está el cilindro B1098?',
    '¿Cuántos cilindros tiene Viña Apaltagua y cuánto llevan allá?',
    '¿Qué clientes tienen más cilindros?',
    '¿Qué se entregó hoy?',
    `¿Cuánto debería cobrarle a Cervecería Rural en ${mes}?`,
    'Dame un resumen del parque',
    '¿Qué cilindros llevan más de 7 días en un cliente?',
  ];
}

/**
 * Portada del panel: asistente de IA que responde preguntas sobre cilindros, clientes,
 * movimientos y arriendo consultando la base con la sesión del usuario (prototipo).
 */
export default function AsistenteChat() {
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [borrador, setBorrador] = useState('');
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    obtenerPerfil()
      .then(setPerfil)
      .catch(() => setPerfil(null));
  }, []);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, pensando]);

  async function enviar(texto: string) {
    const pregunta = texto.trim().slice(0, MAX_PREGUNTA);
    if (!pregunta || pensando) return;
    const historial: MensajeChat[] = [...mensajes, { rol: 'usuario', texto: pregunta }];
    setMensajes(historial);
    setBorrador('');
    setPensando(true);
    try {
      const respuesta = await preguntar(historial);
      setMensajes((m) => [...m, respuesta]);
    } catch (e) {
      const texto = e instanceof Error ? e.message : 'El asistente no está disponible en este momento.';
      setMensajes((m) => [...m, { rol: 'asistente', texto, error: true }]);
    } finally {
      setPensando(false);
      campo.current?.focus();
    }
  }

  function alEnviar(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void enviar(borrador);
  }

  // Enter envía; Shift+Enter agrega una línea.
  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar(borrador);
    }
  }

  if (perfil === undefined) return <p className="text-sm text-gris-500">Cargando…</p>;

  if (!perfil || (perfil.rol !== 'admin' && perfil.rol !== 'gerente')) {
    return (
      <p role="alert" className="rounded-md bg-alerta-fondo p-4 text-sm text-alerta">
        El asistente está disponible solo para administradores y gerentes.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Hola, {perfil.nombre.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-gris-500">
            Pregúntale al asistente por cilindros, clientes, movimientos o arriendo. Responde con los datos de la
            plataforma.
          </p>
        </div>
        {mensajes.length > 0 ? (
          <button type="button" className={botonSecundario} onClick={() => setMensajes([])} disabled={pensando}>
            Nueva conversación
          </button>
        ) : null}
      </div>

      <section aria-label="Conversación con el asistente" className="flex flex-col rounded-lg border border-gris-200 bg-white shadow-sm">
        <div aria-live="polite" className="flex max-h-[60vh] min-h-64 flex-col gap-4 overflow-y-auto px-5 py-5">
          {mensajes.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-gris-700">Puedes empezar con una de estas preguntas:</p>
              <ul className="flex flex-wrap gap-2">
                {sugerencias().map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void enviar(s)}
                      className="rounded-full border border-azul-200 bg-azul-50 px-3 py-1.5 text-left text-sm text-azul-700 hover:bg-azul-100"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            mensajes.map((m, i) => <Burbuja key={i} mensaje={m} perfil={perfil} />)
          )}
          {pensando ? (
            <FilaAgente>
              <p role="status" className="w-fit rounded-lg bg-gris-50 px-4 py-3 text-sm text-gris-500">
                Pensando…
              </p>
            </FilaAgente>
          ) : null}
          <div ref={fin} />
        </div>

        <form onSubmit={alEnviar} className="flex items-end gap-3 border-t border-gris-200 px-5 py-4">
          <label htmlFor="pregunta-asistente" className="sr-only">
            Pregunta para el asistente
          </label>
          <textarea
            id="pregunta-asistente"
            ref={campo}
            rows={2}
            maxLength={MAX_PREGUNTA}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Escribe tu pregunta… (Enter para enviar)"
            className={`${claseCampo} resize-none`}
            disabled={pensando}
          />
          <button type="submit" className={botonPrimario} disabled={pensando || !borrador.trim()}>
            Enviar
          </button>
        </form>
      </section>

      <p className="text-xs text-gris-500">
        Prototipo. El asistente solo lee datos: no modifica nada. No recibe RUT, teléfonos, correos ni direcciones, y
        la conversación se borra al recargar la página.
      </p>
    </div>
  );
}

/** Imagen del asistente (40 px, y el doble para pantallas retina). Si no carga, un círculo con «F». */
function AvatarAgente() {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return (
      <span
        role="img"
        aria-label="Asistente FPC"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-azul-700 text-sm font-bold text-white"
      >
        F
      </span>
    );
  }
  return (
    <img
      src="/agente-avatar-80.webp"
      srcSet="/agente-avatar-80.webp 1x, /agente-avatar-160.webp 2x"
      width={40}
      height={40}
      alt="Asistente FPC"
      loading="lazy"
      decoding="async"
      onError={() => setFallo(true)}
      className="size-10 shrink-0 rounded-full object-cover"
    />
  );
}

/** Fila del asistente: avatar a la izquierda, alineado con el borde superior de la burbuja. */
function FilaAgente({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-3 self-start">
      <AvatarAgente />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Burbuja({ mensaje, perfil }: { mensaje: MensajeChat; perfil: Perfil }) {
  if (mensaje.rol === 'usuario') {
    return (
      <div className="flex max-w-[88%] items-start gap-3 self-end">
        <div className="min-w-0 whitespace-pre-wrap break-words rounded-lg bg-azul-700 px-4 py-3 text-sm text-white">
          {mensaje.texto}
        </div>
        <AvatarUsuario nombre={perfil.nombre} correo={perfil.correo} tamano="size-10" />
      </div>
    );
  }
  if (mensaje.error) {
    return (
      <FilaAgente>
        <p role="alert" className="rounded-lg bg-error-fondo px-4 py-3 text-sm text-error">
          {mensaje.texto}
        </p>
      </FilaAgente>
    );
  }
  return (
    <FilaAgente>
      <div className="overflow-x-auto rounded-lg bg-gris-50 px-4 py-3">
        <TextoConFormato texto={mensaje.texto} />
      </div>
      {mensaje.herramientas?.length ? (
        <p className="mt-1 px-1 text-xs text-gris-500">Consultó: {mensaje.herramientas.join(', ')}</p>
      ) : null}
    </FilaAgente>
  );
}
