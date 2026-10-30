/**
 * Respaldo local del último perfil y camión conocidos.
 *
 * Nunca es la fuente de verdad —Supabase lo es—, pero sin este respaldo un
 * técnico que se queda sin señal después de haber iniciado sesión no puede
 * ni ver su propio perfil ni su vehículo: `sesionActual()` y la carga de
 * camiones dependen de la red. Se guarda en AsyncStorage, igual que el token
 * de GoTrue, para sobrevivir a que se cierre la app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Camion, Usuario } from '../dominio/tipos';

const CLAVE_USUARIO = 'fpc.cacheSesion.usuario';
const CLAVE_CAMION = 'fpc.cacheSesion.camion';

export async function guardarUsuario(usuario: Usuario): Promise<void> {
  await AsyncStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

export async function leerUsuario(): Promise<Usuario | null> {
  const bruto = await AsyncStorage.getItem(CLAVE_USUARIO);
  return bruto ? (JSON.parse(bruto) as Usuario) : null;
}

export async function guardarCamion(camion: Camion | null): Promise<void> {
  if (camion) {
    await AsyncStorage.setItem(CLAVE_CAMION, JSON.stringify(camion));
  } else {
    await AsyncStorage.removeItem(CLAVE_CAMION);
  }
}

export async function leerCamion(): Promise<Camion | null> {
  const bruto = await AsyncStorage.getItem(CLAVE_CAMION);
  return bruto ? (JSON.parse(bruto) as Camion) : null;
}

/** Se llama al cerrar sesión: no debe sobrevivir perfil de un técnico anterior. */
export async function borrar(): Promise<void> {
  await AsyncStorage.multiRemove([CLAVE_USUARIO, CLAVE_CAMION]);
}
