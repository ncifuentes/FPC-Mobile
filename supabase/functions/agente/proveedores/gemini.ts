/**
 * Adaptador de Gemini (API generateContent con function calling).
 *
 * Secretos: GEMINI_API_KEY (obligatorio) y AGENTE_MODELO (opcional, por defecto
 * gemini-3.5-flash-lite). Si el modelo configurado responde 429 o 503 (cuota o sobrecarga), se
 * reintenta UNA vez con gemini-3.5-flash-lite antes de rendirse; desde ahí, el resto de la
 * pregunta sigue con ese modelo.
 *
 * Firmas de pensamiento: los modelos Gemini 3 adjuntan `thoughtSignature` a sus partes y exigen
 * recibirlas de vuelta tal cual. Por eso el turno del modelo se guarda completo en `crudo` y se
 * reenvía sin cambios. Si cambió el modelo a mitad de la pregunta (respaldo), las firmas del otro
 * modelo no sirven y se reemplazan por el valor que la documentación indica para saltar la
 * validación.
 */
import type { LlamadaHerramienta, Mensaje, PeticionModelo, Proveedor, RespuestaModelo } from './tipos.ts';
import { ErrorProveedor } from './tipos.ts';

export const MODELO_RESPALDO = 'gemini-3.5-flash-lite';
const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const FIRMA_NEUTRA = 'skip_thought_signature_validator';

interface ParteGemini {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

interface Contenido {
  role: 'user' | 'model';
  parts: ParteGemini[];
}

/** Lo que se guarda en `crudo`: las partes exactas y qué modelo las produjo. */
interface Crudo {
  modelo: string;
  parts: ParteGemini[];
}

function aContenidos(mensajes: Mensaje[], modelo: string): Contenido[] {
  return mensajes.map((m): Contenido => {
    if (m.rol === 'usuario') return { role: 'user', parts: [{ text: m.texto }] };
    if (m.rol === 'modelo') {
      const crudo = m.crudo as Crudo | undefined;
      if (crudo?.parts?.length) {
        const parts = crudo.modelo === modelo
          ? crudo.parts
          : crudo.parts.map((p) => (p.thoughtSignature ? { ...p, thoughtSignature: FIRMA_NEUTRA } : p));
        return { role: 'model', parts };
      }
      return { role: 'model', parts: [{ text: m.texto ?? '' }] };
    }
    return {
      role: 'user',
      parts: m.resultados.map((r) => {
        const resultado = r.resultado as { error?: unknown } | null;
        const response = resultado && typeof resultado === 'object' && 'error' in resultado
          ? { error: resultado.error }
          : { output: r.resultado };
        return { functionResponse: { ...(r.id ? { id: r.id } : {}), name: r.nombre, response } };
      }),
    };
  });
}

function cuerpo(p: PeticionModelo, modelo: string) {
  return {
    systemInstruction: { parts: [{ text: p.sistema }] },
    contents: aContenidos(p.mensajes, modelo),
    tools: [{
      functionDeclarations: p.herramientas.map((h) => ({
        name: h.nombre,
        description: h.descripcion,
        // Gemini no acepta un objeto sin propiedades: si no hay parámetros, se omite.
        ...(Object.keys(h.parametros.properties).length ? { parameters: h.parametros } : {}),
      })),
    }],
    toolConfig: { functionCallingConfig: { mode: p.permitirHerramientas ? 'AUTO' : 'NONE' } },
  };
}

async function llamar(p: PeticionModelo, modelo: string, clave: string): Promise<RespuestaModelo> {
  const respuesta = await fetch(`${URL_BASE}/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': clave, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo(p, modelo)),
    signal: p.senal,
  });

  if (!respuesta.ok) {
    // El detalle del proveedor no se registra: puede citar el contenido de la petición.
    const s = respuesta.status;
    await respuesta.body?.cancel();
    if (s === 429 || s === 503) throw new ErrorProveedor(`Gemini ${s}`, 'limite');
    if (s === 401 || s === 403 || s === 404) throw new ErrorProveedor(`Gemini ${s}`, 'config');
    throw new ErrorProveedor(`Gemini ${s}`, 'otro');
  }

  const datos = await respuesta.json() as {
    candidates?: { content?: { parts?: ParteGemini[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const candidato = datos.candidates?.[0];
  const parts = candidato?.content?.parts ?? [];

  if (!parts.length) {
    if (datos.promptFeedback?.blockReason || candidato?.finishReason === 'SAFETY') {
      return { tipo: 'texto', texto: 'No puedo responder esa pregunta. Puedo ayudarte con cilindros, clientes, movimientos o arriendo.', modelo };
    }
    throw new ErrorProveedor(`Gemini sin contenido (${candidato?.finishReason ?? 'sin motivo'})`, 'otro');
  }

  const texto = parts.filter((x) => x.text && !x.thought).map((x) => x.text).join('').trim();
  const llamadas: LlamadaHerramienta[] = parts
    .filter((x) => x.functionCall)
    .map((x) => ({ id: x.functionCall!.id, nombre: x.functionCall!.name, argumentos: x.functionCall!.args ?? {} }));
  const crudo: Crudo = { modelo, parts };

  if (llamadas.length) return { tipo: 'herramientas', llamadas, texto: texto || undefined, crudo, modelo };
  return { tipo: 'texto', texto: texto || 'No logré armar una respuesta. Intenta de nuevo.', crudo, modelo };
}

export function crearGemini(): Proveedor {
  const clave = Deno.env.get('GEMINI_API_KEY');
  if (!clave) throw new ErrorProveedor('Falta GEMINI_API_KEY', 'config');
  let modelo = (Deno.env.get('AGENTE_MODELO') || MODELO_RESPALDO).trim();

  return {
    nombre: 'gemini',
    async llamarModelo(p) {
      try {
        return await llamar(p, modelo, clave);
      } catch (e) {
        if (e instanceof ErrorProveedor && e.tipo === 'limite' && modelo !== MODELO_RESPALDO) {
          modelo = MODELO_RESPALDO;
          return await llamar(p, modelo, clave);
        }
        throw e;
      }
    },
  };
}
