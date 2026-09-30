import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colores } from '../../src/theme/tokens';

export default function LayoutTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colores.azul[700] },
        headerTintColor: colores.gris[0],
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colores.azul[600],
        tabBarInactiveTintColor: colores.gris[400],
        tabBarStyle: { borderTopColor: colores.gris[200] },
        sceneStyle: { backgroundColor: colores.gris[50] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historial"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
