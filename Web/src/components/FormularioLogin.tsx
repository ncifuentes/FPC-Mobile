import { useEffect, useState } from 'react';
import { ErrorSesion, iniciarSesion, obtenerPerfil } from '../lib/sesion';

/** Inicio de sesión de la plataforma web (HU-11). Se entra con el correo corporativo. */
export default function FormularioLogin() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Si ya hay una sesión válida, no tiene sentido mostrar el login.
  useEffect(() => {
    obtenerPerfil()
      .then((perfil) => {
        if (perfil) window.location.replace('/');
      })
      .catch(() => undefined);
  }, []);

  async function entrar() {
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion(correo, clave);
      window.location.replace('/');
    } catch (e) {
      setError(e instanceof ErrorSesion ? e.message : 'No se pudo iniciar sesión. Intenta de nuevo.');
      setCargando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        void entrar();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Bienvenido</h1>
        <p className="mt-1 text-sm text-gris-500">Ingresa con tu cuenta para continuar</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gris-700">Correo</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@fpcservicios.cl"
          className="rounded-md border border-gris-300 bg-white px-3.5 py-2.5 text-gris-900 outline-none placeholder:text-gris-400 focus:border-azul-500 focus:ring-2 focus:ring-azul-100"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-gris-700">Contraseña</span>
        <div className="flex rounded-md border border-gris-300 bg-white focus-within:border-azul-500 focus-within:ring-2 focus-within:ring-azul-100">
          <input
            type={verClave ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-transparent px-3.5 py-2.5 text-gris-900 outline-none"
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            className="px-3 text-sm font-medium text-azul-600 hover:text-azul-700"
          >
            {verClave ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </label>

      {error ? (
        <p role="alert" className="rounded-sm bg-error-fondo px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={cargando || !correo || !clave}
        className="mt-1 rounded-md bg-azul-600 py-3 font-semibold text-white hover:bg-azul-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cargando ? 'Ingresando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
