/**
 * Respaldo local del catálogo para operar sin señal.
 *
 * Sin esto el escaneo falla antes de registrar: identificar el cilindro y
 * elegir cliente y sucursal consultan Supabase. Guarda el parque de cilindros
 * (~2.200), los clientes activos y sus sucursales activas en AsyncStorage, con
 * la fecha de la última descarga.
 *
 * Reglas:
 *  - Nunca es la fuente de verdad. Con red se consulta Supabase; esto se usa
 *    solo cuando no la hay.
 *  - El `estado` de un cilindro guardado acá puede estar desactualizado. Sirve
 *    para identificar el envase; el estado efectivo lo arma la proyección de los
 *    movimientos de la cola (`proyeccion.ts`, aplicada en `repositorioProyectado.ts`).
 *  - Se reemplaza entero solo con una descarga completa y no vacía. Si el
 *    refresco falla, queda la copia anterior.
 *  - Se borra al cerrar sesión (`cacheSesion.borrar`): el catálogo está protegido
 *    por RLS y no debe quedar en el teléfono para el siguiente usuario.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Cilindro, Cliente, Movimiento, Sucursal } from '../dominio/tipos';
import { proyectarCilindro, ultimoPorCilindro } from './proyeccion';

export interface Catalogo {
  /** ISO de la última descarga completa. */
  fecha: string;
  cilindros: Cilindro[];
  clientes: Cliente[];
  sucursales: Sucursal[];
}

const CLAVE_FECHA = 'fpc.catalogo.fecha';
const CLAVE_CILINDROS = 'fpc.catalogo.cilindros';
const CLAVE_CLIENTES = 'fpc.catalogo.clientes';
const CLAVE_SUCURSALES = 'fpc.catalogo.sucursales';

export const CLAVES_CATALOGO = [CLAVE_FECHA, CLAVE_CILINDROS, CLAVE_CLIENTES, CLAVE_SUCURSALES];

// Copia en memoria: parsear ~2.200 cilindros en cada escaneo sin señal es caro.
// undefined = todavía no se leyó de AsyncStorage; null = no hay respaldo.
let memoria: Catalogo | null | undefined;

export async function leer(): Promise<Catalogo | null> {
  if (memoria !== undefined) return memoria;
  const pares = await AsyncStorage.multiGet(CLAVES_CATALOGO);
  const valores = Object.fromEntries(pares);
  const fecha = valores[CLAVE_FECHA];
  if (!fecha) {
    memoria = null;
    return null;
  }
  memoria = {
    fecha,
    cilindros: JSON.parse(valores[CLAVE_CILINDROS] ?? '[]') as Cilindro[],
    clientes: JSON.parse(valores[CLAVE_CLIENTES] ?? '[]') as Cliente[],
    sucursales: JSON.parse(valores[CLAVE_SUCURSALES] ?? '[]') as Sucursal[],
  };
  return memoria;
}

/** Reemplaza el respaldo. Una descarga vacía o parcial no se guarda. */
export async function guardar(catalogo: Catalogo): Promise<boolean> {
  if (
    catalogo.cilindros.length === 0 ||
    catalogo.clientes.length === 0 ||
    catalogo.sucursales.length === 0
  ) {
    return false;
  }
  await escribir(catalogo);
  return true;
}

async function escribir(catalogo: Catalogo): Promise<void> {
  await AsyncStorage.multiSet([
    [CLAVE_CILINDROS, JSON.stringify(catalogo.cilindros)],
    [CLAVE_CLIENTES, JSON.stringify(catalogo.clientes)],
    [CLAVE_SUCURSALES, JSON.stringify(catalogo.sucursales)],
    // La fecha al final: `multiSet` no es atómico en todas las plataformas.
    [CLAVE_FECHA, catalogo.fecha],
  ]);
  memoria = catalogo;
}

/**
 * Lleva al respaldo el efecto de movimientos que el servidor YA aceptó. Sin
 * esto, una vez que salen de la cola, sin señal se volvería a ver el estado de
 * la última descarga. No toca la fecha: no es una descarga.
 */
export async function aplicarMovimientos(movimientos: Movimiento[]): Promise<void> {
  const catalogo = await leer();
  if (!catalogo || movimientos.length === 0) return;
  const ultimos = ultimoPorCilindro(movimientos);
  await escribir({
    ...catalogo,
    cilindros: catalogo.cilindros.map((c) => proyectarCilindro(c, ultimos.get(c.id))),
  });
}

export async function borrar(): Promise<void> {
  memoria = null;
  await AsyncStorage.multiRemove(CLAVES_CATALOGO);
}
