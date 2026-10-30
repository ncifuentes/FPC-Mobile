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
import { supabase } from './supabase';

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
    if (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('failed to connect')
    ) {
      return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    }
  }
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

/**
 * Busca la fila del usuario autenticado y valida que pueda operar. Si no
 * existe o está inactiva, cierra la sesión recién abierta: no tiene sentido
 * dejar un token vivo para alguien que no debe entrar.
 */
async function resolverUsuario(authUserId: string): Promise<Usuario> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id,nombre,rol,camion_jornada_id,activo')
    .eq('id', authUserId)
    .maybeSingle<FilaUsuario>();

  if (error) {
    await supabase.auth.signOut();
    throw new ErrorDominio('No se pudo verificar tu cuenta. Intenta de nuevo.');
  }
  if (!data) {
    await supabase.auth.signOut();
    throw new ErrorDominio('Tu cuenta no está habilitada en el sistema. Contacta al administrador.');
  }
  if (!data.activo) {
    await supabase.auth.signOut();
    throw new ErrorDominio('Tu cuenta está deshabilitada. Contacta al administrador.');
  }

  return {
    id: data.id,
    nombre: data.nombre,
    usuario: authUserId,
    rol: data.rol,
    camionAsignadoId: data.camion_jornada_id,
  };
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
    },

    async sesionActual() {
      const { data } = await supabase.auth.getSession();
      const authUserId = data.session?.user.id;
      if (!authUserId) return null;
      try {
        return await resolverUsuario(authUserId);
      } catch {
        // La sesión de GoTrue seguía viva pero el usuario ya no puede operar
        // (deshabilitado o sin fila): resolverUsuario ya cerró la sesión.
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
