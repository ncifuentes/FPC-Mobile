/**
 * Implementación de autenticación y camiones sobre Supabase (Sprint 5, auth
 * primero). Clientes, cilindros y movimientos siguen en memoria hasta que se
 * migren: ver `src/datos/index.ts`.
 *
 * El login es por correo (`supabase.auth.signInWithPassword`). Después de
 * autenticar hay que leer la fila en `public.usuarios` por `auth.uid()`: no
 * basta con la sesión de `auth.users` porque ahí vive el rol, el nombre y el
 * camión de la jornada, y porque un usuario puede existir en `auth.users` sin
 * estar habilitado para operar (sin fila, o con `activo = false`).
 */

import { ErrorDominio } from '../dominio/repositorios';
import type { RepositorioAutenticacion, RepositorioCamiones } from '../dominio/repositorios';
import type { Camion, Rol, Usuario } from '../dominio/tipos';
import * as cacheSesion from './cacheSesion';
import { supabase } from './supabase';

/**
 * Se lanza cuando `usuarios.select` falla por falta de red, nunca por RLS ni
 * por datos: distingue "no hay forma de confirmar el perfil" de "el servidor
 * confirmó que no puede entrar". Solo la segunda cierra la sesión.
 */
class ErrorRed extends Error {}

function esErrorDeRed(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('failed to connect') ||
    m.includes('timeout')
  );
}

interface FilaUsuario {
  id: string;
  nombre: string;
  rol: Rol;
  camion_jornada_id: string | null;
  activo: boolean;
}

interface FilaCamion {
  id: string;
  patente: string;
  descripcion: string | null;
  capacidad_cilindros: number;
  activo: boolean;
}

function mapearCamion(fila: FilaCamion): Camion {
  return {
    id: fila.id,
    patente: fila.patente,
    descripcion: fila.descripcion ?? '',
    capacidadCilindros: fila.capacidad_cilindros,
    activo: fila.activo,
  };
}

/**
 * Mensaje sin detalles técnicos: la pantalla de login no debe mostrar
 * códigos de error de GoTrue ni de Postgres, solo si el problema es la
 * credencial o la conexión.
 */
function mensajeErrorAuth(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid login credentials')) {
      return 'Correo o contraseña incorrectos.';
    }
    if (esErrorDeRed(msg)) {
      return 'Sin conexión. Conéctate para iniciar sesión.';
    }
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

/**
 * Busca la fila del usuario autenticado y valida que pueda operar.
 *
 * Si el servidor confirma que no puede entrar (sin fila, o `activo = false`)
 * cierra la sesión recién abierta: no tiene sentido dejar un token vivo para
 * alguien que no debe operar. Pero si la consulta falla por falta de red, eso
 * no es una respuesta del servidor —es ausencia de respuesta— y lanza
 * `ErrorRed` sin tocar la sesión: quien llama decide si hay un perfil en
 * caché con el que seguir operando offline.
 */
async function resolverUsuario(authUserId: string): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nombre,rol,camion_jornada_id,activo')
    .eq('id', authUserId)
    .maybeSingle<FilaUsuario>();

  if (error) {
    if (esErrorDeRed(error.message)) {
      throw new ErrorRed(error.message);
    }
    await supabase.auth.signOut();
    await cacheSesion.borrar();
    throw new ErrorDominio('No se pudo verificar tu cuenta. Intenta de nuevo.');
  }
  if (!data) {
    await supabase.auth.signOut();
    await cacheSesion.borrar();
    throw new ErrorDominio('Tu cuenta no está habilitada en el sistema. Contacta al administrador.');
  }
  if (!data.activo) {
    await supabase.auth.signOut();
    await cacheSesion.borrar();
    throw new ErrorDominio('Tu cuenta está deshabilitada. Contacta al administrador.');
  }

  const usuario: Usuario = {
    id: data.id,
    nombre: data.nombre,
    usuario: authUserId,
    rol: data.rol,
    camionAsignadoId: data.camion_jornada_id,
  };
  await cacheSesion.guardarUsuario(usuario);
  return usuario;
}

export function crearRepositorioAutenticacionSupabase(): RepositorioAutenticacion {
  return {
    async iniciarSesion(correo, clave) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: clave,
      });
      if (error || !data.user) {
        throw new ErrorDominio(mensajeErrorAuth(error));
      }
      return resolverUsuario(data.user.id);
    },

    async cerrarSesion() {
      await supabase.auth.signOut();
      await cacheSesion.borrar();
    },

    async sesionActual() {
      const { data } = await supabase.auth.getSession();
      const authUserId = data.session?.user.id;
      if (!authUserId) return null;
      try {
        return await resolverUsuario(authUserId);
      } catch (error) {
        if (error instanceof ErrorRed) {
          // Sin conexión no hay cómo confirmar el perfil contra el servidor,
          // pero tampoco motivo para cerrar una sesión que sigue siendo
          // válida: se sigue operando con el último perfil conocido.
          return cacheSesion.leerUsuario();
        }
        // resolverUsuario ya cerró la sesión (sin fila, inactivo, u otro
        // error real del servidor).
        return null;
      }
    },
  };
}

export function crearRepositorioCamionesSupabase(): RepositorioCamiones {
  return {
    async listar() {
      const { data, error } = await supabase
        .from('camiones')
        .select('id,patente,descripcion,capacidad_cilindros,activo')
        .eq('activo', true);
      if (error) {
        // Sin datos sensibles: solo para distinguir en consola un RLS/GRANT
        // faltante (error con código Postgres) de un nombre de tabla o
        // columna mal escrito, sin tener que reproducirlo a mano.
        console.warn('[repositorioSupabase] camiones.listar falló:', error.message, error.code);
        throw new ErrorDominio('No se pudo cargar la lista de camiones.');
      }
      return (data as FilaCamion[]).map(mapearCamion);
    },

    async obtener(id) {
      const { data, error } = await supabase
        .from('camiones')
        .select('id,patente,descripcion,capacidad_cilindros,activo')
        .eq('id', id)
        .maybeSingle<FilaCamion>();
      if (error) {
        throw new ErrorDominio('No se pudo cargar el camión.');
      }
      return data ? mapearCamion(data) : null;
    },
  };
}
