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
import type { Camion, MovimientoDetallado, Usuario } from '../dominio/tipos';
import * as cacheCatalogo from './cacheCatalogo';

const CLAVE_USUARIO = 'fpc.cacheSesion.usuario';
const CLAVE_CAMION = 'fpc.cacheSesion.camion';
const CLAVE_DEL_DIA = 'fpc.cacheSesion.movimientosDelDia';

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

/**
 * Último listado del día que entregó el servidor (BUG-02). Sin señal, la
 * validación «ya está en la carga de hoy» solo veía la cola del teléfono y
 * aceptaba cargar de nuevo un cilindro que ya había llegado al servidor.
 */
interface DelDia {
  camionId: string;
  dia: string;
  movimientos: MovimientoDetallado[];
}

export async function guardarDelDia(valor: DelDia): Promise<void> {
  await AsyncStorage.setItem(CLAVE_DEL_DIA, JSON.stringify(valor));
}

/** Solo si es del mismo camión y del mismo día; si no, null. */
export async function leerDelDia(camionId: string, dia: string): Promise<MovimientoDetallado[] | null> {
  const bruto = await AsyncStorage.getItem(CLAVE_DEL_DIA);
  if (!bruto) return null;
  const v = JSON.parse(bruto) as DelDia;
  return v.camionId === camionId && v.dia === dia ? v.movimientos : null;
}

/**
 * Se llama al cerrar sesión: no debe sobrevivir perfil de un técnico anterior,
 * ni el catálogo, que está protegido por RLS. La cola de movimientos NO se
 * borra: son registros de terreno que todavía no llegan al servidor.
 */
export async function borrar(): Promise<void> {
  await AsyncStorage.multiRemove([CLAVE_USUARIO, CLAVE_CAMION, CLAVE_DEL_DIA]);
  await cacheCatalogo.borrar();
}
