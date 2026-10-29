/**
 * Sesión y perfil del usuario de la plataforma web (HU-11 y HU-20).
 *
 * La identidad vive en Supabase Auth (auth.users); el rol vive en public.usuarios.
 * A la web solo entran admin y gerente: el técnico trabaja desde la app móvil.
 * El gerente ve lo mismo que el admin pero sin poder editar (HU-20); esa restricción
 * la impone la RLS en la base, y la interfaz solo oculta los botones con `puedeEditar`.
 */
import { supabase } from './supabase';
import type { Enum } from './database.types';

export type Rol = Enum<'rol_usuario'>;

export interface Perfil {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
}

const ROLES_WEB: readonly Rol[] = ['admin', 'gerente'];

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  tecnico: 'Técnico',
};

/** Error con un mensaje listo para mostrarle al usuario. */
export class ErrorSesion extends Error {}

let perfilEnCurso: Promise<Perfil | null> | null = null;
let cerrando = false;

/** true mientras este mismo navegador está cerrando la sesión a pedido del usuario. */
export function estaCerrandoSesion(): boolean {
  return cerrando;
}

/**
 * Perfil del usuario con sesión iniciada, o null si no hay sesión válida para la web.
 * Se resuelve una sola vez por carga de página y lo comparten todas las islas.
 */
export function obtenerPerfil(): Promise<Perfil | null> {
  perfilEnCurso ??= cargarPerfil();
  return perfilEnCurso;
}

async function cargarPerfil(): Promise<Perfil | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, activo')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw new ErrorSesion('No se pudo leer tu perfil. Revisa tu conexión e intenta de nuevo.');
  if (!data || !data.activo || !ROLES_WEB.includes(data.rol)) return null;

  return { id: data.id, nombre: data.nombre, rol: data.rol, correo: session.user.email ?? '' };
}

export async function iniciarSesion(correo: string, clave: string): Promise<Perfil> {
  const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
  if (error) throw new ErrorSesion(traducirError(error.message));

  perfilEnCurso = null;
  const { data: sesion } = await supabase.auth.getSession();
  const { data: ficha } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', sesion.session?.user.id ?? '')
    .maybeSingle();

  // Cualquier cuenta que no sea de la web se cierra de inmediato, para no dejar una sesión
  // abierta que no puede usar ninguna pantalla.
  if (!ficha) {
    await supabase.auth.signOut();
    throw new ErrorSesion('Tu cuenta no tiene un perfil asignado. Pídele a un administrador que lo cree.');
  }
  if (!ficha.activo) {
    await supabase.auth.signOut();
    throw new ErrorSesion('Tu cuenta está desactivada.');
  }
  if (ficha.rol === 'tecnico') {
    await supabase.auth.signOut();
    throw new ErrorSesion('Las cuentas de técnico se usan en la aplicación móvil, no en la plataforma web.');
  }

  const perfil = await obtenerPerfil();
  if (!perfil) throw new ErrorSesion('No se pudo iniciar sesión. Intenta de nuevo.');
  return perfil;
}

export async function cerrarSesion(): Promise<void> {
  cerrando = true;
  await supabase.auth.signOut();
  perfilEnCurso = null;
  window.location.replace('/login');
}

/** Solo el admin modifica datos; el gerente consulta (HU-20). */
export function puedeEditar(perfil: Perfil): boolean {
  return perfil.rol === 'admin';
}

function traducirError(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(mensaje)) return 'Tu correo todavía no está confirmado.';
  if (/fetch|network/i.test(mensaje)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}
