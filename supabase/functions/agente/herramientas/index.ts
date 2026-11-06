/** Registro de las herramientas del agente. Todas son de solo lectura. */
import type { Herramienta } from './tipos.ts';
import { ubicarCilindro } from './ubicar_cilindro.ts';
import { buscarCliente } from './buscar_cliente.ts';
import { cilindrosDeCliente } from './cilindros_de_cliente.ts';
import { rankingClientes } from './ranking_clientes.ts';
import { movimientos } from './movimientos.ts';
import { informeArriendo } from './informe_arriendo.ts';
import { resumenParque } from './resumen_parque.ts';
import { cilindrosConMasDe } from './cilindros_con_mas_de.ts';

export const HERRAMIENTAS: Herramienta[] = [
  ubicarCilindro,
  buscarCliente,
  cilindrosDeCliente,
  rankingClientes,
  movimientos,
  informeArriendo,
  resumenParque,
  cilindrosConMasDe,
];

export const POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));
