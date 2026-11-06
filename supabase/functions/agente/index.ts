/**
 * Edge Function `agente`: asistente de IA de la plataforma web (prototipo, Capstone).
 *
 * El admin o el gerente preguntan en lenguaje natural y el modelo responde usando herramientas
 * FIJAS de solo lectura (./herramientas). No hay SQL generado por el modelo ni base vectorial.
 *
 * Cuerpo: `{ mensajes: [{ rol: 'usuario' | 'asistente', texto }] }` (se usan los últimos 10).
 * Respuesta 200: `{ respuesta, herramientas_usadas: [{ nombre, argumentos }], modelo }`.
 * Errores: 400 cuerpo inválido · 401 sin sesión · 403 rol no permitido · 429 proveedor ocupado ·
 * 503 asistente sin configurar · 504 tiempo agotado · 502 otra falla del proveedor.
 *
 * SEGURIDAD
 *  - El cliente de Supabase se crea con la clave publicable y el JWT de quien pregunta, nunca con
 *    service_role: las herramientas ven exactamente lo que la RLS le deja ver a ese usuario.
 *  - Solo admin y gerente (igual que la web).
 *  - Al modelo solo llegan nombres de cliente y sucursal, series, productos, estados, fechas y
 *    cantidades. Ninguna herramienta selecciona RUT, teléfonos, correos ni direcciones.
 *  - No se guardan conversaciones. Los registros solo tienen herramientas usadas, duración y estado.
 *
 * Secretos: GEMINI_API_KEY, AGENTE_MODELO (opcional, por defecto gemini-3.5-flash-lite) y
 * AGENTE_PROVEEDOR (opcional, `gemini`).
 * SUPABASE_URL y SUPABASE_ANON_KEY los inyecta Supabase.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { construirContexto } from './contexto.ts';
import { HERRAMIENTAS, POR_NOMBRE } from './herramientas/index.ts';
import { ErrorHerramienta } from './herramientas/comun.ts';
import { obtenerProveedor } from './proveedores/index.ts';
import { ErrorProveedor, type Mensaje, type ResultadoHerramienta } from './proveedores/tipos.ts';

const MAX_MENSAJES = 10;
const MAX_TEXTO = 2000;
const MAX_LLAMADAS = 5;
const MAX_VUELTAS = 8;
const TIEMPO_LIMITE_MS = 50_000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(cuerpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Registro sin contenido: solo qué herramientas se usaron, cuánto tardó y cómo terminó. */
function registrar(estado: string, inicio: number, herramientas: string[], modelo?: string): void {
  console.log(JSON.stringify({ evento: 'agente', estado, ms: Date.now() - inicio, herramientas, modelo }));
}

function leerMensajes(cuerpo: unknown): Mensaje[] | null {
  const lista = (cuerpo as { mensajes?: unknown })?.mensajes;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const mensajes: Mensaje[] = [];
  for (const m of lista.slice(-MAX_MENSAJES)) {
    const rol = (m as { rol?: unknown })?.rol;
    const texto = (m as { texto?: unknown })?.texto;
    if ((rol !== 'usuario' && rol !== 'asistente') || typeof texto !== 'string' || !texto.trim()) return null;
    const recortado = texto.trim().slice(0, MAX_TEXTO);
    mensajes.push(rol === 'usuario' ? { rol: 'usuario', texto: recortado } : { rol: 'modelo', texto: recortado });
  }
  // La conversación debe empezar y terminar con el usuario.
  while (mensajes.length && mensajes[0].rol !== 'usuario') mensajes.shift();
  if (!mensajes.length || mensajes[mensajes.length - 1].rol !== 'usuario') return null;
  return mensajes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  const inicio = Date.now();

  // ---------------------------------------------------------------- sesión y rol
  const autorizacion = req.headers.get('Authorization') ?? '';
  const token = autorizacion.replace(/^Bearer\s+/i, '');
  if (!token) return responder({ error: 'Falta la sesión' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sesion, error: errorSesion } = await db.auth.getUser(token);
  if (errorSesion || !sesion.user) return responder({ error: 'Sesión inválida o vencida' }, 401);

  const { data: perfil } = await db.from('usuarios').select('rol, activo').eq('id', sesion.user.id).maybeSingle();
  if (!perfil || !perfil.activo || (perfil.rol !== 'admin' && perfil.rol !== 'gerente')) {
    return responder({ error: 'El asistente está disponible solo para administradores y gerentes' }, 403);
  }

  // ---------------------------------------------------------------- cuerpo
  let mensajes: Mensaje[] | null = null;
  try {
    mensajes = leerMensajes(await req.json());
  } catch {
    // cuerpo vacío o no JSON
  }
  if (!mensajes) return responder({ error: 'Conversación inválida' }, 400);

  // ---------------------------------------------------------------- ciclo modelo → herramientas
  const usadas: { nombre: string; argumentos: Record<string, unknown> }[] = [];
  const nombresUsados = () => usadas.map((u) => u.nombre);
  let modelo: string | undefined;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const proveedor = obtenerProveedor();
    const sistema = construirContexto(new Date());
    const declaraciones = HERRAMIENTAS.map((h) => ({
      nombre: h.nombre,
      descripcion: h.descripcion,
      parametros: h.parametros,
    }));

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const r = await proveedor.llamarModelo({
        sistema,
        mensajes,
        herramientas: declaraciones,
        permitirHerramientas: usadas.length < MAX_LLAMADAS,
        senal: control.signal,
      });

      modelo = r.modelo ?? modelo;
      if (r.tipo === 'texto') {
        registrar('ok', inicio, nombresUsados(), modelo);
        return responder({ respuesta: r.texto, herramientas_usadas: usadas, modelo });
      }

      mensajes.push({ rol: 'modelo', texto: r.texto, llamadas: r.llamadas, crudo: r.crudo });
      const resultados: ResultadoHerramienta[] = [];
      for (const llamada of r.llamadas) {
        const herramienta = POR_NOMBRE.get(llamada.nombre);
        let resultado: unknown;
        if (usadas.length >= MAX_LLAMADAS) {
          resultado = { error: `Se alcanzó el máximo de ${MAX_LLAMADAS} consultas por pregunta. Responde con lo que ya tienes.` };
        } else if (!herramienta) {
          resultado = { error: `La herramienta «${llamada.nombre}» no existe.` };
        } else {
          usadas.push({ nombre: llamada.nombre, argumentos: llamada.argumentos });
          try {
            resultado = await herramienta.ejecutar(db, llamada.argumentos ?? {});
          } catch (e) {
            resultado = {
              error: e instanceof ErrorHerramienta
                ? e.message
                : 'No se pudo consultar la base de datos en este momento.',
            };
          }
        }
        resultados.push({ id: llamada.id, nombre: llamada.nombre, resultado });
      }
      mensajes.push({ rol: 'herramientas', resultados });
    }

    registrar('sin_respuesta', inicio, nombresUsados(), modelo);
    return responder({
      respuesta: 'No logré armar una respuesta con las consultas disponibles. Intenta con una pregunta más específica.',
      herramientas_usadas: usadas,
      modelo,
    });
  } catch (e) {
    if (control.signal.aborted) {
      registrar('tiempo_agotado', inicio, nombresUsados());
      return responder({ error: 'La consulta tardó demasiado. Intenta de nuevo o con una pregunta más acotada.' }, 504);
    }
    if (e instanceof ErrorProveedor && e.tipo === 'limite') {
      registrar('limite_proveedor', inicio, nombresUsados());
      return responder({ error: 'El asistente está ocupado, intenta en un minuto.' }, 429);
    }
    if (e instanceof ErrorProveedor && e.tipo === 'config') {
      registrar('sin_configurar', inicio, nombresUsados());
      return responder({ error: 'El asistente no está configurado todavía.' }, 503);
    }
    registrar('error_proveedor', inicio, nombresUsados());
    return responder({ error: 'El asistente no está disponible en este momento. Intenta de nuevo.' }, 502);
  } finally {
    clearTimeout(reloj);
  }
});
