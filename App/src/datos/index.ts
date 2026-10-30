/**
 * Punto único de cableado de la capa de datos.
 *
 * Auth, camiones, clientes, sucursales y cilindros viven en Supabase. Los
 * movimientos siguen en memoria hasta la tarea de sincronización; cuando eso
 * pase, se reemplaza acá y no en las pantallas, que solo conocen la interfaz
 * `Repositorios`.
 */

import type { Repositorios } from '../dominio/repositorios';
import { crearRepositorioMovimientos } from './repositorioMemoria';
import {
  crearRepositorioAutenticacionSupabase,
  crearRepositorioCamionesSupabase,
} from './repositorioSupabase';
import {
  crearRepositorioCilindrosSupabase,
  crearRepositorioClientesSupabase,
  crearRepositorioSucursalesSupabase,
} from './repositorioSupabaseCatalogo';

const clientes = crearRepositorioClientesSupabase();
const sucursales = crearRepositorioSucursalesSupabase();
const cilindros = crearRepositorioCilindrosSupabase();

export const repos: Repositorios = {
  auth: crearRepositorioAutenticacionSupabase(),
  camiones: crearRepositorioCamionesSupabase(),
  clientes,
  sucursales,
  cilindros,
  movimientos: crearRepositorioMovimientos({ cilindros, sucursales, clientes }),
};
