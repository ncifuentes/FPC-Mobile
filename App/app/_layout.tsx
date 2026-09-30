import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ProveedorSesion } from '../src/estado/sesion';
import { colores } from '../src/theme/tokens';

/**
 * Stack raíz y proveedores globales.
 *
 * Por ahora sólo monta la sesión. El proveedor de sincronización y la ruta del
 * escáner entran con las pantallas de operación: dependen de la cola local y
 * del endpoint de envío por lotes, que son trabajo posterior.
 */
export default function LayoutRaiz() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ProveedorSesion>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colores.azul[700] },
              headerTintColor: colores.gris[0],
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colores.gris[50] },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </ProveedorSesion>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
