/**
 * Punto único de cableado de la capa de datos.
 *
 * Para pasar a Supabase: escribir `repositorioSupabase.ts` cumpliendo la interfaz
 * `Repositorios` y cambiar la línea de abajo. Nada más del proyecto debe cambiar.
 */

import type { Repositorios } from '../dominio/repositorios';
import { crearRepositorioMemoria } from './repositorioMemoria';

export const repos: Repositorios = crearRepositorioMemoria();
