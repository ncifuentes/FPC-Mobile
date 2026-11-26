/**
 * Punto único de cableado de la capa de datos.
 *
 * Auth, camiones, clientes, sucursales, cilindros y movimientos viven en
 * Supabase. Encima de eso, dos piezas locales que las pantallas no ven:
 *  - el respaldo de catálogo para operar sin señal (`cacheCatalogo.ts`, usado
 *    dentro de `repositorioSupabaseCatalogo.ts`);
 *  - la cola de movimientos pendientes (`src/sync/colaLocal.ts`), que es la
 *    fuente de los movimientos que todavía no llegan y de la proyección del
 *    estado de los cilindros (`repositorioProyectado.ts`).
 */

import type { Repositorios } from '../dominio/repositorios';
import { colaLocal } from '../sync/colaLocal';
import { crearRepositorioMovimientos } from './repositorioMovimientos';
import { crearRepositorioCilindrosProyectado } from './repositorioProyectado';
import {
  crearRepositorioAutenticacionSupabase,
  crearRepositorioCamionesSupabase,
} from './repositorioSupabase';
import {
  crearRepositorioCilindrosSupabase,
  crearRepositorioClientesSupabase,
  crearRepositorioSucursalesSupabase,
} from './repositorioSupabaseCatalogo';

export const repos: Repositorios = {
  auth: crearRepositorioAutenticacionSupabase(),
  camiones: crearRepositorioCamionesSupabase(),
  clientes: crearRepositorioClientesSupabase(),
  sucursales: crearRepositorioSucursalesSupabase(),
  cilindros: crearRepositorioCilindrosProyectado(crearRepositorioCilindrosSupabase(), colaLocal),
  movimientos: crearRepositorioMovimientos(colaLocal),
};
