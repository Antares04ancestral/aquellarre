import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../contexts/supabase';

export default function QRScreen({ route, navigation }) {
  // Obtener los datos del producto de los parámetros de navegación
  const { productId, productName, potionsCost, user, canjeId } = route.params || {};

  const idCliente = user?.id;
  const idProducto = productId;
  const [status, setStatus] = useState('pendiente');
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Declarar processSuccessfulCanje antes de cualquier uso
  const processSuccessfulCanje = useCallback(async () => {
    try {
      setStatus('realizado');
      const currentPosiones = (user?.posiones ?? 0);
      const newValorPosiones = currentPosiones - (potionsCost || 0);
      const normalizedPosiones = newValorPosiones < 0 ? 0 : newValorPosiones;
      const { error } = await supabase
        .from('cliente')
        .update({ posiones: normalizedPosiones })
        .eq('id', idCliente);
      if (error) {
        Alert.alert('Error', 'No se pudo actualizar las posiones');
        return;
      }
      // Mostrar status realizado por 2 segundos antes de navegar
      setTimeout(() => {
        console.log('Navegando a Home desde QRScreen');
        navigation.navigate('Home', {
          user: { ...user, posiones: normalizedPosiones },
        });
      }, 2000);
    } catch (error) {
      Alert.alert('Error', 'Error al procesar el canje');
    }
  }, [user, potionsCost, idCliente, navigation]);

  // Crear un string JSON para el QR con id del canje, cliente y producto
  const qrData = JSON.stringify({
    id_canje: canjeId,
    id_cliente: idCliente,
    id_producto: idProducto,
  });

  // Función para obtener el status actual del canje
  const fetchCanjeStatus = useCallback(async () => {
    if (!canjeId) return;
    try {
      const { data, error } = await supabase
        .from('canje')
        .select('status')
        .eq('id', canjeId)
        .single();
      if (!error && data?.status) {
        setStatus(data.status);
        if (data.status === 'realizado') {
          console.log('Status cambiado a realizado por polling');
          await processSuccessfulCanje();
        } else if (data.status === 'cancelado') {
          navigation.navigate('Home');
        }
      }
    } catch (e) {
      console.warn('Error al obtener status del canje:', e);
    }
  }, [canjeId, processSuccessfulCanje]);

  // Polling cada 20 segundos para actualizar el status
  useEffect(() => {
    fetchCanjeStatus(); // primera carga
    const intervalId = setInterval(() => {
      fetchCanjeStatus();
    }, 20000);
    return () => clearInterval(intervalId);
  }, [fetchCanjeStatus]);

  // Suscripción realtime para cambios en el status
  useEffect(() => {
    if (!canjeId || isMonitoring) return;
    setIsMonitoring(true);
    let subscription;
    (async () => {
      try {
        subscription = supabase
          .channel('canje_status_changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'canje',
              filter: `id=eq.${canjeId}`
            },
            async (payload) => {
              console.log('Evento realtime recibido en QRScreen:', payload);
              const newStatus = payload.new.status;
              setStatus(newStatus);
              if (newStatus === 'realizado') {
                console.log('Status cambiado a realizado por realtime');
                await processSuccessfulCanje();
              } else if (newStatus === 'cancelado') {
                navigation.navigate('Home');
              }
            }
          )
          .subscribe();
        // Verificación inicial
        const { data: canjeData, error } = await supabase
          .from('canje')
          .select('status')
          .eq('id', canjeId)
          .single();
        if (!error && canjeData?.status) {
          setStatus(canjeData.status);
          if (canjeData.status === 'realizado') {
            console.log('Status ya era realizado al montar');
            await processSuccessfulCanje();
          } else if (canjeData.status === 'cancelado') {
            navigation.navigate('Home');
          }
        }
      } catch (error) {
        setIsMonitoring(false);
      }
    })();
    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, [canjeId, isMonitoring, processSuccessfulCanje]);

  const handleGoBack = async () => {
    // Cancelar: actualizar el status del canje a "cancelado" y regresar a Home
    try {
      if (canjeId) {
        const { error } = await supabase
          .from('canje')
          .update({ status: 'cancelado' })
          .eq('id', canjeId);

        if (error) {
          Alert.alert('Error', 'No se pudo cancelar el canje');
          return;
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Error al cancelar el canje');
      return;
    } finally {
      navigation.navigate('Home');
    }
  };

  return (
    <View style={styles.container}>
      {/* Botón de regreso */}
      <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Canjear Producto</Text>
      <Text style={styles.productName}>{productName}</Text>
      <Text style={styles.cost}>Costo: {potionsCost} posiones</Text>
      <View style={styles.qrContainer}>
        <Image 
          source={{ 
            uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}` 
          }} 
          style={styles.qr} 
        />
      </View>
      {/* Mostrar el status debajo del QR */}
      <Text style={styles.status}>Estado: {status}</Text>
      <Text style={styles.info}>Muestra este código para obtener tu producto</Text>
      <Text style={styles.warning}>⚠️ Las posiones se descontarán al escanear el QR</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#1a1a2e', // Fondo oscuro místico
    alignItems: 'center', 
    justifyContent: 'center',
    position: 'relative'
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: '#4c1d95', // Púrpura más oscuro
    width: 55,
    height: 55,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 3,
    borderColor: '#7c3aed', // Borde púrpura medio
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  backButtonText: {
    fontSize: 30,
    color: '#fbbf24', // Dorado místico
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  title: { 
    fontSize: 28, 
    color: '#fbbf24', // Dorado místico
    fontFamily: 'cursive', 
    marginBottom: 10,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
    fontWeight: 'bold',
  },
  productName: { 
    fontSize: 20, 
    color: '#e5e7eb', // Gris claro
    fontWeight: 'bold', 
    marginBottom: 5,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  cost: { 
    fontSize: 16, 
    color: '#10b981', // Verde místico
    marginBottom: 20,
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  qrContainer: { 
    backgroundColor: '#fff', 
    padding: 25, 
    borderRadius: 15, 
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#8b5cf6', // Borde púrpura
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  qr: { 
    width: 200, 
    height: 200 
  },
  info: { 
    fontSize: 16, 
    color: '#e5e7eb', // Gris claro
    marginTop: 10, 
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  warning: { 
    fontSize: 14, 
    color: '#fbbf24', // Dorado místico
    marginTop: 15, 
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  status: { 
    fontSize: 16, 
    color: '#10b981', // Verde místico
    marginTop: 20, 
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
}); 