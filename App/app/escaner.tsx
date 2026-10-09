import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Boton, Campo, Nota } from '../src/componentes/ui';
import { cancelarCaptura, entregarCodigo } from '../src/estado/capturaCodigo';
import { colores, espacios, radios } from '../src/theme/tokens';

/**
 * Formatos de código de barras LINEAL que trae de fábrica el parque de FPC.
 * Se incluye QR sólo como cortesía; el rótulo real es lineal.
 */
const FORMATOS = [
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
  'qr',
] as const;

export default function Escaner() {
  const router = useRouter();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [linterna, setLinterna] = useState(false);
  const yaCapturado = useRef(false);

  // Si el usuario cierra el modal con el gesto del sistema, la promesa que
  // espera la pantalla de operación tiene que resolverse igual.
  useEffect(() => {
    return () => {
      if (!yaCapturado.current) cancelarCaptura();
    };
  }, []);

  const capturar = useCallback(
    (codigo: string, origen: 'escaner' | 'manual') => {
      const limpio = codigo.trim().toUpperCase();
      if (limpio.length === 0 || yaCapturado.current) return;
      yaCapturado.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      entregarCodigo({ codigo: limpio, origen });
      router.back();
    },
    [router],
  );

  function alEscanear(resultado: BarcodeScanningResult) {
    capturar(resultado.data, 'escaner');
  }

  /* ---------------------------------------------------------- ingreso manual */

  if (manual) {
    return (
      <KeyboardAvoidingView
        style={estilos.pantallaClara}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={estilos.manual}>
          <View style={estilos.manualEncabezado}>
            <Ionicons name="keypad-outline" size={26} color={colores.azul[600]} />
            <Text style={estilos.manualTitulo}>Ingreso manual del código</Text>
          </View>

          <Nota texto="Usa esta opción cuando el envase no trae código de barras de fábrica. El movimiento queda marcado como ingreso manual para poder revisarlo después." />

          <Campo
            valor={codigoManual}
            onChange={setCodigoManual}
            placeholder="Ej: CIL-001234"
            icono="barcode-outline"
            autoCapitalize="characters"
            onSubmit={() => capturar(codigoManual, 'manual')}
          />

          <Boton
            titulo="Confirmar código"
            icono="checkmark-circle-outline"
            onPress={() => capturar(codigoManual, 'manual')}
            deshabilitado={codigoManual.trim().length === 0}
          />
          <Boton
            titulo="Volver a la cámara"
            icono="camera-outline"
            variante="secundario"
            onPress={() => setManual(false)}
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* -------------------------------------------------------------- permisos */

  if (!permiso) {
    return <View style={estilos.pantallaClara} />;
  }

  if (!permiso.granted) {
    return (
      <View style={[estilos.pantallaClara, estilos.manual]}>
        <View style={estilos.manualEncabezado}>
          <Ionicons name="camera-outline" size={26} color={colores.azul[600]} />
          <Text style={estilos.manualTitulo}>Permiso de cámara</Text>
        </View>
        <Nota texto="FPC Mobile necesita la cámara para leer el código de barras del cilindro. Si prefieres no darlo, puedes escribir el código a mano." />
        <Boton titulo="Permitir cámara" icono="camera-outline" onPress={() => void pedirPermiso()} />
        <Boton
          titulo="Ingresar código manualmente"
          icono="keypad-outline"
          variante="secundario"
          onPress={() => setManual(true)}
        />
      </View>
    );
  }

  /* ---------------------------------------------------------------- cámara */

  return (
    <View style={estilos.pantallaOscura}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={linterna}
        barcodeScannerSettings={{ barcodeTypes: [...FORMATOS] }}
        onBarcodeScanned={alEscanear}
      />

      <View style={estilos.marco}>
        <View style={estilos.recuadro} />
        <Text style={estilos.instruccion}>Apunta la cámara al código del cilindro</Text>
      </View>

      <View style={estilos.controles}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Linterna"
          onPress={() => setLinterna((v) => !v)}
          style={estilos.control}
        >
          <Ionicons
            name={linterna ? 'flashlight' : 'flashlight-outline'}
            size={22}
            color={colores.azul[700]}
          />
          <Text style={estilos.controlTexto}>Linterna</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setManual(true)}
          style={[estilos.control, estilos.controlPrincipal]}
        >
          <Ionicons name="keypad-outline" size={22} color={colores.gris[0]} />
          <Text style={[estilos.controlTexto, { color: colores.gris[0] }]}>
            Ingresar a mano
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantallaClara: { flex: 1, backgroundColor: colores.gris[0] },
  pantallaOscura: { flex: 1, backgroundColor: '#000000' },
  manual: { padding: espacios.xl, gap: espacios.lg, justifyContent: 'center', flex: 1 },
  manualEncabezado: { flexDirection: 'row', alignItems: 'center', gap: espacios.md },
  manualTitulo: { fontSize: 18, fontWeight: '700', color: colores.gris[900] },
  marco: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espacios.xl },
  recuadro: {
    width: '72%',
    aspectRatio: 1.4,
    borderRadius: radios.lg,
    borderWidth: 3,
    borderColor: colores.gris[0],
  },
  instruccion: {
    color: colores.gris[0],
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: espacios.xl,
  },
  controles: {
    flexDirection: 'row',
    gap: espacios.md,
    padding: espacios.lg,
    backgroundColor: colores.gris[0],
    borderTopLeftRadius: radios.xl,
    borderTopRightRadius: radios.xl,
  },
  control: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacios.sm,
    borderRadius: radios.md,
    borderWidth: 1,
    borderColor: colores.gris[200],
  },
  controlPrincipal: { backgroundColor: colores.azul[600], borderColor: colores.azul[600] },
  controlTexto: { fontSize: 14, fontWeight: '600', color: colores.azul[700] },
});
