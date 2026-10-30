import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
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
import { colores, espacios } from '../src/theme/tokens';

// La imagen mide 1200 x 360; con ~390 pt de ancho de pantalla queda en ~117 pt.
const ALTO_OLA = 120;

export default function Login() {
  const router = useRouter();
  const { iniciarSesion } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar() {
    setError(null);
    setCargando(true);
    try {
      await iniciarSesion(correo, clave);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <Image
              source={require('../assets/logo-fpc-horizontal.png')}
              style={estilos.logo}
              resizeMode="contain"
              accessibilityLabel="FPC Servicios"
            />
            <Text style={estilos.marcaSubtitulo}>Distribución de Gases Industriales</Text>
          </View>

          <View style={estilos.formulario}>
            <Text style={estilos.titulo}>Bienvenido</Text>
            <Text style={estilos.subtitulo}>Ingresa a tu cuenta para continuar</Text>

            <Campo
              valor={correo}
              onChange={setCorreo}
              placeholder="Correo"
              icono="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
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

      {/* Ola con los colores de la empresa, pegada al borde inferior (Mockup1). */}
      <View style={estilos.ola} pointerEvents="none">
        <Image
          source={require('../assets/login-ola.png')}
          style={{ width: '100%', height: ALTO_OLA }}
          resizeMode="stretch"
        />
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.gris[0] },
  // El pie de página queda sobre la ola: el padding inferior es el alto de la ola.
  contenido: {
    flexGrow: 1,
    padding: espacios.xl,
    paddingBottom: ALTO_OLA + espacios.md,
    justifyContent: 'space-between',
  },
  ola: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  marca: { alignItems: 'center', gap: espacios.sm, paddingTop: espacios.xxl },
  // Proporción del archivo (1274 x 599): ancho fijo, alto calculado.
  logo: { width: 240, height: 113 },
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
