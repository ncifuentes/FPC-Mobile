/**
 * Edge Function `enviar-comprobante`: envía por correo el comprobante de un folio.
 *
 * La invoca la app después de `registrar_comprobante`, con la sesión del
 * técnico (`supabase.functions.invoke`). Cuerpo: `{ "folio": 123 }`.
 *
 * Flujo:
 *  1. Verifica el JWT del que llama (Supabase ya rechaza la llamada sin JWT
 *     válido; acá se obtiene el usuario para comprobar que el folio sea suyo).
 *  2. `datos_comprobante(folio, usuario)`: datos del correo; falla si el folio no
 *     es del usuario (salvo admin) o no tiene comprobante registrado.
 *  3. Si ya no está `pendiente` (enviado, sin correo, error), no hace nada:
 *     reintentar no reenvía.
 *  4. Envía con Resend usando `Idempotency-Key`: si la respuesta se pierde y la
 *     app reintenta, Resend no manda un segundo correo.
 *  5. `resultado_envio_comprobante` deja el resultado.
 *
 * Respuestas para la app:
 *  - 200 `{ estado }`: terminado (`enviado`, `sin_correo` o `error` definitivo:
 *    el proveedor rechazó la dirección). La app no reintenta.
 *  - 400/403/404: la llamada no tiene arreglo reintentando.
 *  - 502/503: transitorio (proveedor caído, límite de envíos, falta configurar
 *    el remitente). El comprobante queda `pendiente` y la app reintenta.
 *
 * Secretos (los configura el administrador con `supabase secrets set`, nunca en
 * el repositorio):
 *  - RESEND_API_KEY
 *  - COMPROBANTE_REMITENTE, p. ej. `FPC <comprobantes@dominio-verificado.cl>`
 *  - COMPROBANTE_RESPONDER_A (opcional): adónde llegan las respuestas del cliente.
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { armarComprobante, type DatosComprobante } from './plantilla.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function responder(cuerpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function anotarResultado(
  folio: number,
  enviado: boolean,
  idProveedor: string | null,
  error: string | null,
  definitivo: boolean,
): Promise<void> {
  const { error: e } = await admin.rpc('resultado_envio_comprobante', {
    p_folio: folio,
    p_enviado: enviado,
    p_id_proveedor: idProveedor,
    p_error: error,
    p_definitivo: definitivo,
  });
  if (e) console.error(`[comprobante ${folio}] no se pudo anotar el resultado: ${e.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return responder({ error: 'Falta la sesión' }, 401);
  const { data: sesion, error: errorSesion } = await admin.auth.getUser(token);
  if (errorSesion || !sesion.user) return responder({ error: 'Sesión inválida' }, 401);

  let folio = NaN;
  try {
    folio = Number((await req.json())?.folio);
  } catch {
    // cuerpo vacío o no JSON: cae en la validación de abajo
  }
  if (!Number.isSafeInteger(folio) || folio <= 0) {
    return responder({ error: 'Folio inválido' }, 400);
  }

  const { data, error: errorDatos } = await admin.rpc('datos_comprobante', {
    p_folio: folio,
    p_solicitante: sesion.user.id,
  });
  if (errorDatos) {
    const status = errorDatos.code === '42501' ? 403 : errorDatos.code === 'P0001' ? 404 : 502;
    return responder({ error: errorDatos.message }, status);
  }
  const datos = data as DatosComprobante;
  if (datos.estado !== 'pendiente' || !datos.email_destino) {
    return responder({ estado: datos.estado });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const remitente = Deno.env.get('COMPROBANTE_REMITENTE');
  if (!apiKey || !remitente) {
    // Queda pendiente: se envía solo cuando el administrador configure los secretos.
    return responder({ error: 'El envío de correos no está configurado' }, 503);
  }

  const correo = armarComprobante(datos);
  const responderA = Deno.env.get('COMPROBANTE_RESPONDER_A');

  let respuesta: Response;
  try {
    respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `comprobante-${folio}`,
      },
      body: JSON.stringify({
        from: remitente,
        to: [datos.email_destino],
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
        ...(responderA ? { reply_to: responderA } : {}),
      }),
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    await anotarResultado(folio, false, null, `Sin respuesta del proveedor: ${mensaje}`, false);
    return responder({ error: 'Sin respuesta del proveedor de correo' }, 502);
  }

  const cuerpo = (await respuesta.json().catch(() => ({}))) as { id?: string; message?: string };
  if (respuesta.ok) {
    await anotarResultado(folio, true, cuerpo.id ?? null, null, false);
    return responder({ estado: 'enviado' });
  }

  // 400/422: la dirección o el contenido no sirven y reintentar da lo mismo.
  // El resto (403 de dominio sin verificar, 409, 429, 5xx) se arregla con
  // configuración o esperando: queda pendiente.
  const definitivo = respuesta.status === 400 || respuesta.status === 422;
  const mensaje = `Proveedor ${respuesta.status}: ${cuerpo.message ?? 'sin detalle'}`;
  await anotarResultado(folio, false, null, mensaje, definitivo);
  return definitivo
    ? responder({ estado: 'error', error: mensaje })
    : responder({ error: mensaje }, 502);
});
