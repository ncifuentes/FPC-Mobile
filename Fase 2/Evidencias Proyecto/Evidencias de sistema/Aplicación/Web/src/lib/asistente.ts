/**
 * Asistente de IA de la página Inicio (prototipo). Llama a la Edge Function `agente` con la sesión
 * del usuario: la función consulta la base con ese mismo JWT, así que el asistente ve exactamente
 * lo que la RLS le deja ver a quien pregunta. La conversación vive solo en el navegador.
 */
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface MensajeChat {
  rol: 'usuario' | 'asistente';
  texto: string;
  /** Herramientas que consultó el asistente para esta respuesta. */
  herramientas?: string[];
  /** Respuesta fallida: se muestra, pero no se reenvía como contexto. */
  error?: boolean;
}

interface RespuestaAgente {
  respuesta: string;
  herramientas_usadas: { nombre: string; argumentos: Record<string, unknown> }[];
}

/** La función solo usa los últimos 10 mensajes. */
const MAX_HISTORIAL = 10;

export async function preguntar(historial: MensajeChat[]): Promise<MensajeChat> {
  const mensajes = historial
    .filter((m) => !m.error)
    .slice(-MAX_HISTORIAL)
    .map(({ rol, texto }) => ({ rol, texto }));

  const { data, error } = await supabase.functions.invoke<RespuestaAgente>('agente', { body: { mensajes } });

  if (error) throw new Error(await traducirError(error));
  if (!data?.respuesta) throw new Error('El asistente no devolvió una respuesta. Intenta de nuevo.');

  // Nombres sin repetir, en el orden en que se usaron.
  const herramientas = [...new Set(data.herramientas_usadas.map((h) => h.nombre))];
  return { rol: 'asistente', texto: data.respuesta, herramientas };
}

async function traducirError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const respuesta = error.context as Response;
    if (respuesta.status === 401) return 'Tu sesión venció o se cerró. Recarga la página y vuelve a iniciar sesión.';
    const cuerpo = await respuesta.json().catch(() => null);
    if (cuerpo?.error) return String(cuerpo.error);
  }
  if (error instanceof FunctionsFetchError) return 'No se pudo conectar con el asistente. Revisa tu conexión.';
  return 'El asistente no está disponible en este momento. Intenta de nuevo.';
}
