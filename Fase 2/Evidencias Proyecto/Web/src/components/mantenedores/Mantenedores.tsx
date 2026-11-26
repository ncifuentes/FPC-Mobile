import { useEffect, useState } from 'react';
import { obtenerPerfil, puedeEditar as puedeEditarPerfil, type Perfil } from '../../lib/sesion';
import MantClientes from './MantClientes';
import MantCilindros from './MantCilindros';
import MantUsuarios from './MantUsuarios';
import MantCamiones from './MantCamiones';

const PESTANAS = [
  { id: 'clientes', nombre: 'Clientes y sucursales' },
  { id: 'cilindros', nombre: 'Cilindros' },
  { id: 'usuarios', nombre: 'Usuarios' },
  { id: 'camiones', nombre: 'Camiones' },
] as const;
type Pestana = (typeof PESTANAS)[number]['id'];

function pestanaDeLaUrl(): Pestana {
  const p = new URLSearchParams(window.location.search).get('pestana');
  return PESTANAS.some((x) => x.id === p) ? (p as Pestana) : 'clientes';
}

/**
 * Gestión de datos maestros (los «mantenedores» de HU-12 a HU-14). El administrador crea y edita; el gerente solo consulta (HU-20).
 * La pestaña elegida queda en la URL (?pestana=cilindros) para poder volver a ella.
 */
export default function Mantenedores() {
  const [pestana, setPestana] = useState<Pestana>(pestanaDeLaUrl);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    void obtenerPerfil().then(setPerfil);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (pestana === 'clientes') url.searchParams.delete('pestana');
    else url.searchParams.set('pestana', pestana);
    window.history.replaceState(null, '', url);
  }, [pestana]);

  if (!perfil) return <p className="text-sm text-gris-500">Cargando…</p>;
  const editar = puedeEditarPerfil(perfil);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Gestión</h1>
        <p className="mt-1 text-sm text-gris-500">
          {editar
            ? 'Alta y edición de los datos maestros. Nada se borra: lo que deja de usarse se da de baja y su historial se conserva.'
            : 'Consulta de los datos maestros. Tu rol de gerente es de solo lectura.'}
        </p>
      </div>

      <div role="tablist" aria-label="Gestión" className="flex gap-1 overflow-x-auto border-b border-gris-200">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${
              pestana === p.id ? 'border-azul-700 text-azul-700' : 'border-transparent text-gris-500 hover:text-gris-900'
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {pestana === 'clientes' ? (
          <MantClientes puedeEditar={editar} />
        ) : pestana === 'cilindros' ? (
          <MantCilindros puedeEditar={editar} />
        ) : pestana === 'usuarios' ? (
          <MantUsuarios puedeEditar={editar} miId={perfil.id} />
        ) : (
          <MantCamiones puedeEditar={editar} />
        )}
      </div>
    </div>
  );
}
