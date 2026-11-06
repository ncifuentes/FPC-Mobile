/** Hasta dos iniciales del nombre; sin nombre, la inicial del correo. */
export function iniciales(nombre: string, correo = ''): string {
  const deNombre = nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? '')
    .join('');
  return deNombre || correo.trim()[0]?.toUpperCase() || '?';
}

interface Props {
  nombre: string;
  correo?: string;
  /** Foto de perfil (aún no existe): si viene, se muestra en lugar de las iniciales. */
  fotoUrl?: string;
  /** Tamaño en clases de Tailwind; por defecto el de la barra superior. */
  tamano?: string;
}

/** Círculo del usuario: su foto si la hay o sus iniciales sobre azul claro. */
export default function AvatarUsuario({ nombre, correo, fotoUrl, tamano = 'size-9' }: Props) {
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={`${tamano} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${tamano} grid shrink-0 place-items-center rounded-full bg-azul-100 text-sm font-bold text-azul-700`}
    >
      {iniciales(nombre, correo)}
    </span>
  );
}
