import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { coincide, type ClienteLista } from '../lib/clientes';

interface Props {
  clientes: ClienteLista[];
  valor: string | null;
  onElegir: (id: string) => void;
}

const MAXIMO_OPCIONES = 30;

/** Campo con búsqueda para elegir un cliente por nombre, RUT o comuna. */
export default function SelectorCliente({ clientes, valor, onElegir }: Props) {
  const elegido = clientes.find((c) => c.id === valor) ?? null;
  const [texto, setTexto] = useState(elegido?.nombre ?? '');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const idLista = useId();
  const contenedor = useRef<HTMLDivElement>(null);

  // Si el cliente cambia desde afuera (p. ej. llega por la URL), se muestra su nombre.
  useEffect(() => {
    if (elegido) setTexto(elegido.nombre);
  }, [elegido]);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const opciones = useMemo(() => {
    const buscando = abierto && texto !== elegido?.nombre ? texto : '';
    const lista = buscando ? clientes.filter((c) => coincide(c.buscable, buscando)) : clientes;
    return lista.slice(0, MAXIMO_OPCIONES);
  }, [clientes, texto, abierto, elegido]);

  function elegir(c: ClienteLista) {
    setTexto(c.nombre);
    setAbierto(false);
    onElegir(c.id);
  }

  return (
    <div ref={contenedor} className="relative">
      <input
        id="cliente"
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Buscar por nombre, RUT o comuna…"
        value={texto}
        onFocus={(e) => {
          setAbierto(true);
          e.target.select();
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAbierto(true);
            setActivo((a) => Math.min(a + 1, opciones.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && abierto && opciones[activo]) {
            e.preventDefault();
            elegir(opciones[activo]);
          } else if (e.key === 'Escape') {
            setAbierto(false);
            if (elegido) setTexto(elegido.nombre);
          }
        }}
        className="w-full rounded-md border border-gris-300 bg-white px-3 py-2 text-sm text-gris-900"
      />
      {abierto ? (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-gris-200 bg-white py-1 shadow-lg"
        >
          {opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gris-500">Ningún cliente coincide.</li>
          ) : (
            opciones.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={c.id === valor}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(c);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === activo ? 'bg-azul-50' : ''}`}
              >
                <span className="font-medium text-gris-900">{c.nombre}</span>
                <span className="block text-xs text-gris-500">
                  {c.rut}
                  {c.comuna ? ` · ${c.comuna}` : ''}
                  {c.cilindros ? ` · ${c.cilindros} en poder` : ''}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
