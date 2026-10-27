/**
 * Cola local en web.
 *
 * Metro elige este archivo en lugar de `colaLocal.ts` cuando la plataforma es
 * web, así `expo-sqlite` no entra nunca al bundle del navegador. Es lo que
 * corresponde: SQLite no corre en web, y su respaldo `wa-sqlite` exige un
 * `.wasm` con cabeceras COOP/COEP que no aportan nada acá.
 *
 * Ojo: en web la cola es en memoria y se pierde al recargar. `npm run web`
 * sirve para revisar maquetación; la prueba de aceptación offline se hace en el
 * teléfono.
 */

import { crearColaMemoria, type ColaLocal } from './colaMemoria';

export type { ColaLocal };

export const colaLocal: ColaLocal = crearColaMemoria();
