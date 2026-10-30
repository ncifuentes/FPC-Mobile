/**
 * Punto único de cableado de la capa de datos.
 *
 * Sprint 5 (auth): `auth` y `camiones` ya viven en Supabase. Clientes,
 * cilindros y movimientos siguen en `repositorioMemoria` hasta que se migren;
 * cuando eso pase, se reemplaza esa parte acá y no en las pantallas, que solo
 * conocen la interfaz `Repositorios`.
 */

import type { Repositorios } from '../dominio/repositorios';
import { crearRepositorioMemoria } from './repositorioMemoria';
import {
  crearRepositorioAutenticacionSupabase,
  crearRepositorioCamionesSupabase,
} from './repositorioSupabase';

const memoria = crearRepositorioMemoria();

export const repos: Repositorios = {
  ...memoria,
  auth: crearRepositorioAutenticacionSupabase(),
  camiones: crearRepositorioCamionesSupabase(),
};
