import { useEffect, useState } from 'react';
import { cerrarSesion, NOMBRE_ROL, obtenerPerfil, type Perfil } from '../lib/sesion';

/** Nombre, rol y botón para cerrar sesión, en la barra superior del panel. */
export default function MenuUsuario() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    obtenerPerfil().then(setPerfil).catch(() => setPerfil(null));
  }, []);

  if (!perfil) return null;

  const iniciales = perfil.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-semibold text-gris-900">{perfil.nombre}</p>
        <p className="text-xs text-gris-500">{NOMBRE_ROL[perfil.rol]}</p>
      </div>
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-full bg-azul-100 text-sm font-bold text-azul-700"
      >
        {iniciales}
      </span>
      <button
        type="button"
        onClick={() => {
          setSaliendo(true);
          void cerrarSesion();
        }}
        disabled={saliendo}
        className="rounded-sm border border-gris-200 px-3 py-1.5 text-sm font-medium text-gris-700 hover:bg-gris-100 disabled:opacity-60"
      >
        {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  );
}
