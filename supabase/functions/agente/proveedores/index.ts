/**
 * Elige el proveedor con el secreto AGENTE_PROVEEDOR (por defecto `gemini`).
 *
 * Para pasar a Claude: crear `claude.ts` que implemente `Proveedor` (Messages API con `tools`,
 * bloques `tool_use` / `tool_result` emparejados por `id`), registrarlo abajo y cargar los
 * secretos ANTHROPIC_API_KEY y AGENTE_MODELO. Herramientas, contexto e interfaz no cambian.
 */
import type { Proveedor } from './tipos.ts';
import { ErrorProveedor } from './tipos.ts';

const PROVEEDORES: Record<string, () => Proveedor> = {
  // gemini: crearGemini,   (Fase 2)
  // claude: crearClaude,   (futuro)
};

export function obtenerProveedor(): Proveedor {
  const nombre = (Deno.env.get('AGENTE_PROVEEDOR') ?? 'gemini').trim().toLowerCase();
  const crear = PROVEEDORES[nombre];
  if (!crear) throw new ErrorProveedor(`Proveedor «${nombre}» no disponible`, 'config');
  return crear();
}
