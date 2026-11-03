/**
 * Cilindros con la proyección de la cola local aplicada encima.
 *
 * El repositorio base (Supabase, o el respaldo sin señal) entrega el estado
 * "crudo". Acá se le superpone el último movimiento de la cola de cada envase
 * (`proyeccion.ts`), así las pantallas ven el cilindro como si sus movimientos
 * pendientes ya hubieran llegado y ninguna tiene que saber que existe la cola.
 *
 * Entran a la proyección los movimientos `pendiente` y `sin_folio`. Los
 * `sin_folio` ya están en el servidor y con red el dato crudo ya los refleja
 * (aplicarlos de nuevo da lo mismo); sin red, el respaldo puede ser anterior a
 * ellos. Los `rechazado` NO entran: el servidor no los aceptó, el envase no
 * cambió de estado.
 */

import type { RepositorioCilindros } from '../dominio/repositorios';
import type { Cilindro, Movimiento, Uuid } from '../dominio/tipos';
import type { ColaLocal } from '../sync/colaMemoria';
import { proyectarCilindro, ultimoPorCilindro } from './proyeccion';

export async function movimientosEfectivos(cola: ColaLocal): Promise<Movimiento[]> {
  return (await cola.listar()).filter((m) => m.estadoEnvio !== 'rechazado');
}

export function crearRepositorioCilindrosProyectado(
  base: RepositorioCilindros,
  cola: ColaLocal,
): RepositorioCilindros {
  async function ultimos(): Promise<Map<Uuid, Movimiento>> {
    return ultimoPorCilindro(await movimientosEfectivos(cola));
  }

  async function proyectar(c: Cilindro | null): Promise<Cilindro | null> {
    if (!c) return null;
    return proyectarCilindro(c, (await ultimos()).get(c.id));
  }

  /**
   * Proyecta una lista del servidor, filtra por la condición ya proyectada y
   * agrega los envases que solo por un movimiento local cumplen la condición
   * (p. ej. recién cargados: el servidor todavía los tiene `en_planta`).
   */
  async function listarProyectado(
    lista: Cilindro[],
    cumple: (c: Cilindro, ultimo: Movimiento | undefined) => boolean,
  ): Promise<Cilindro[]> {
    const ult = await ultimos();
    const presentes = new Set(lista.map((c) => c.id));
    const faltantes = await Promise.all(
      Array.from(ult.keys())
        .filter((id) => !presentes.has(id))
        .map((id) => base.obtener(id).catch(() => null)),
    );
    return [...lista, ...faltantes.filter((c): c is Cilindro => c !== null)]
      .map((c) => ({ proyectado: proyectarCilindro(c, ult.get(c.id)), ultimo: ult.get(c.id) }))
      .filter(({ proyectado, ultimo }) => cumple(proyectado, ultimo))
      .map(({ proyectado }) => proyectado);
  }

  return {
    async obtenerPorCodigo(codigo) {
      return proyectar(await base.obtenerPorCodigo(codigo));
    },
    async obtener(id) {
      return proyectar(await base.obtener(id));
    },
    async listarPorEstado(estado) {
      return listarProyectado(await base.listarPorEstado(estado), (c) => c.estado === estado);
    },
    async listarEnCamion(camionId) {
      const enServidor = new Set((await base.listarEnCamion(camionId)).map((c) => c.id));
      const candidatos = await base.listarPorEstado('en_camion').catch(() => [] as Cilindro[]);
      return listarProyectado(candidatos, (c, ultimo) => {
        if (c.estado !== 'en_camion') return false;
        // Con movimiento local, el vehículo es el de ese movimiento; sin él,
        // el que resolvió el servidor.
        return ultimo && ultimo.tipo !== 'entrega' ? ultimo.camionId === camionId : enServidor.has(c.id);
      });
    },
    async buscar(texto) {
      const ult = await ultimos();
      return (await base.buscar(texto)).map((c) => proyectarCilindro(c, ult.get(c.id)));
    },
  };
}
