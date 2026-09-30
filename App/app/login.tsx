import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton, Campo } from '../src/componentes/ui';
import { useSesion } from '../src/estado/sesion';
import { colores, espacios, radios } from '../src/theme/tokens';

export default function Login() {
  const router = useRouter();
  const { iniciarSesion } = useSesion();
  const [usuario, setUsuario] = useState('bnunez');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion(usuario, clave);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <View style={estilos.logo}>
              <Text style={estilos.logoTexto}>FPC</Text>
            </View>
            <Text style={estilos.marcaTitulo}>FPC Servicios</Text>
            <Text style={estilos.marcaSubtitulo}>Distribución de Gases Industriales</Text>
          </View>

          <View style={estilos.formulario}>
            <Text style={estilos.titulo}>Bienvenido</Text>
            <Text style={estilos.subtitulo}>Ingresa a tu cuenta para continuar</Text>

            <Campo
              valor={usuario}
              onChange={setUsuario}
              placeholder="Usuario"
              icono="person-outline"
            />
            <Campo
              valor={clave}
              onChange={setClave}
              placeholder="Contraseña"
              icono="lock-closed-outline"
              secreto
              onSubmit={entrar}
            />

            {error ? <Text style={estilos.error}>{error}</Text> : null}

            <Boton titulo="Iniciar sesión" onPress={entrar} cargando={cargando} />

            <Pressable onPress={() => {}} style={estilos.enlaceContenedor}>
              <Text style={estilos.enlace}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </View>

          <View style={estilos.pie}>
            <Text style={estilos.pieTitulo}>FPC Servicios</Text>
            <Text style={estilos.pieTexto}>
              Comprometidos con la energía que mueve tu industria
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.gris[0] },
  contenido: { flexGrow: 1, padding: espacios.xl, justifyContent: 'space-between' },
  marca: { alignItems: 'center', gap: espacios.sm, paddingTop: espacios.xxl },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radios.xl,
    backgroundColor: colores.azul[700],
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: { color: colores.gris[0], fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  marcaTitulo: { fontSize: 20, fontWeight: '700', color: colores.azul[800] },
  marcaSubtitulo: { fontSize: 13, color: colores.gris[500] },
  formulario: { gap: espacios.md, paddingVertical: espacios.xxl },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.gris[900] },
  subtitulo: { fontSize: 14, color: colores.gris[500], marginBottom: espacios.sm },
  error: { color: colores.error, fontSize: 13 },
  enlaceContenedor: { alignItems: 'center', paddingTop: espacios.sm },
  enlace: { color: colores.azul[600], fontSize: 13, fontWeight: '600' },
  pie: { alignItems: 'center', gap: 2 },
  pieTitulo: { fontSize: 13, fontWeight: '700', color: colores.azul[700] },
  pieTexto: { fontSize: 11, color: colores.gris[400], textAlign: 'center' },
});
