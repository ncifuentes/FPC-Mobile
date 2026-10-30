/**
 * Datos de ejemplo que quedaron de antes de conectar Supabase.
 *
 * Clientes y cilindros ya se leen de Supabase (ver `repositorioSupabaseCatalogo.ts`):
 * sus listas de ejemplo se quitaron de acá porque tenían la forma vieja del
 * modelo (cliente con dirección propia, cilindro con `clienteActualId`), que ya
 * no existe. USUARIOS y CAMIONES quedan solo como referencia: nada los importa
 * hoy (auth y camiones también se leen de Supabase), pero no tienen datos
 * personales reales y no estorban si se necesitan para una prueba rápida.
 */

import type { Camion, Usuario } from '../dominio/tipos';

export const USUARIOS: Usuario[] = [
  {
    id: 'usr-0001',
    nombre: 'Bastián Núñez',
    usuario: 'bnunez',
    rol: 'tecnico',
    camionAsignadoId: 'cam-0001',
  },
  {
    id: 'usr-0002',
    nombre: 'Nicolás Castillo',
    usuario: 'ncastillo',
    rol: 'admin',
    camionAsignadoId: null,
  },
];

export const CAMIONES: Camion[] = [
  {
    id: 'cam-0001',
    patente: 'JZ-PV-45',
    descripcion: 'Camión de reparto',
    capacidadCilindros: 30,
    activo: true,
  },
  {
    id: 'cam-0002',
    patente: 'KL-RT-12',
    descripcion: 'Camioneta',
    capacidadCilindros: 16,
    activo: true,
  },
];
