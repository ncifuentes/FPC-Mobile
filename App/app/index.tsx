import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useSesion } from '../src/estado/sesion';
import { colores } from '../src/theme/tokens';

/** Puerta de entrada: decide entre el login y la app según haya sesión. */
export default function Entrada() {
  const { usuario, cargando } = useSesion();

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colores.azul[600]} />
      </View>
    );
  }

  return usuario ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
