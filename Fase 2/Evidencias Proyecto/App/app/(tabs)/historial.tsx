import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Campo, Fila, Nota, Seccion, Tarjeta, Vacio } from '../../src/componentes/ui';
import { repos } from '../../src/datos';
import { ETIQUETA_ESTADO, formatearCapacidad, type Cilindro } from '../../src/dominio/tipos';
import { espacios } from '../../src/theme/tokens';

export default function Historial() {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [cilindros, setCilindros] = useState<Cilindro[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void repos.cilindros
      .buscar(busqueda)
      .then((r) => {
        if (!vivo) return;
        setCilindros(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error && e.message ? e.message : 'No se pudo buscar cilindros.');
      });
    return () => {
      vivo = false;
    };
  }, [busqueda]);

  return (
    <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <Campo
        valor={busqueda}
        onChange={setBusqueda}
        placeholder="Buscar cilindro por N° de serie..."
        icono="search-outline"
        autoCapitalize="characters"
      />

      {error ? <Nota tono="alerta" texto={error} /> : null}

      <View>
        <Seccion texto="Cilindros" />
        <Tarjeta style={{ paddingVertical: espacios.sm }}>
          {cilindros.length === 0 ? (
            <Vacio texto="No hay cilindros que coincidan con la búsqueda." />
          ) : (
            cilindros.map((c) => (
              <Fila
                key={c.id}
                titulo={c.codigo}
                subtitulo={`${c.tipoGas ?? 'Gas no especificado'} · ${formatearCapacidad(c)} · ${ETIQUETA_ESTADO[c.estado]}`}
                onPress={() =>
                  router.push({ pathname: '/cilindro/[codigo]', params: { codigo: c.codigo } })
                }
              />
            ))
          )}
        </Tarjeta>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: espacios.lg, gap: espacios.lg },
});
