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
 * Monta la sesión y declara el escáner como modal. El proveedor de
 * sincronización todavía no entra: la cola local de pendientes y el envío por
 * lotes dependen del backend, que es trabajo posterior. Mientras tanto los
 * movimientos se registran contra el repositorio en memoria.
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
            <Stack.Screen
              name="escaner"
              options={{ presentation: 'modal', title: 'Escanear cilindro' }}
            />
          </Stack>
        </ProveedorSesion>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
