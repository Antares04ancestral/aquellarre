import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../contexts/supabase';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

export default function RegisterScreen({ navigation }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorType, setErrorType] = useState(''); // 'connection' o 'invalid_data'
  const [checkingSession, setCheckingSession] = useState(true);

  // Verificar si hay una sesión activa al cargar la pantalla
  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const savedUser = await AsyncStorage.getItem('userSession');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        // Verificar que el usuario aún existe en la base de datos
        const { data, error } = await supabase
          .from('cliente')
          .select('*')
          .eq('id', userData.id)
          .limit(1);
        
        if (!error && data && data.length > 0) {
          // Usuario existe, navegar directamente a Home
          navigation.replace('Home', { user: data[0] });
          return;
        } else {
          // Usuario ya no existe, limpiar sesión
          await AsyncStorage.removeItem('userSession');
        }
      }
    } catch (error) {
      console.log('Error verificando sesión:', error);
    } finally {
      setCheckingSession(false);
    }
  };

  const handleLogin = async () => {
    if (input.trim() === '') return;
    setLoading(true);
    const cleanInput = input.trim();
    
    try {
    // Buscar por email o telefono en minúsculas
    const { data, error } = await supabase
      .from('cliente')
      .select('*')
      .or(`email.eq.${cleanInput},telefono.eq.${cleanInput}`)
      .limit(1);
      
    setLoading(false);
      
    if (error) {
        // Error de conexión o problema con Supabase
        setErrorType('connection');
        setShowErrorModal(true);
      return;
    }
      
    if (data && data.length > 0) {
        // Datos correctos - guardar sesión y navegar a Home
        const userData = data[0];
        await saveUserSession(userData);
        await registerForPushNotificationsAndSave(userData.id);
        navigation.replace('Home', { user: userData });
      } else {
        // Datos incorrectos - usuario no existe
        setErrorType('invalid_data');
        setShowErrorModal(true);
      }
    } catch (error) {
      // Error de red o conexión
      setLoading(false);
      setErrorType('connection');
      setShowErrorModal(true);
    }
  };

  const saveUserSession = async (userData) => {
    try {
      await AsyncStorage.setItem('userSession', JSON.stringify(userData));
    } catch (error) {
      console.log('Error guardando sesión:', error);
    }
  };

  const registerForPushNotificationsAndSave = async (userId) => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      if (!Device.isDevice) {
        console.log('Las notificaciones push requieren un dispositivo físico.');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Permiso de notificaciones no concedido.');
        return;
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        undefined;

      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResponse?.data;
      if (!expoPushToken) {
        console.log('No se pudo obtener el token de notificaciones.');
        return;
      }

      try {
        await AsyncStorage.setItem('expoPushToken', expoPushToken);
      } catch (e) {
        console.log('No se pudo guardar el token localmente:', e);
      }

      const { error: updateError } = await supabase
        .from('cliente')
        .update({ token: expoPushToken })
        .eq('id', userId);

      if (updateError) {
        console.log('Error actualizando token en BD:', updateError);
      }
    } catch (e) {
      console.log('Error registrando notificaciones:', e);
    }
  };

  const closeErrorModal = () => {
    setShowErrorModal(false);
    setErrorType('');
  };

  const getErrorTitle = () => {
    return errorType === 'connection' ? 'Error de Conexión' : 'Acceso Denegado';
  };

  const getErrorMessage = () => {
    if (errorType === 'connection') {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a internet e intenta nuevamente.';
    } else {
      return 'Correo o teléfono incorrecto, vuelve a intentarlo.';
    }
  };

  const getModalButtonColor = () => {
    return errorType === 'connection' ? '#ff6b35' : '#00cfff';
  };

  // Mostrar loading mientras verifica la sesión
  if (checkingSession) {
    return (
      <View style={styles.container}>
        <View style={styles.innerContainer}>
          <Image source={require('../assets/Gato.jpeg')} style={styles.logo} />
          <Text style={styles.title}>Bienvenido Cafetería Aquelarre</Text>
          <Text style={styles.loadingText}>Verificando sesión...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.innerContainer}>
        <Image source={require('../assets/Gato.jpeg')} style={styles.logo} />
        <Text style={styles.title}>Bienvenido Cafetería Aquelarre</Text>
        <Text style={styles.label}>Correo electrónico o teléfono:</Text>
        <TextInput
          style={styles.input}
          placeholder="Ingresa tu correo o teléfono"
          value={input}
          onChangeText={setInput}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Verificando...' : 'Ingresar'}</Text>
        </TouchableOpacity>
        <Text style={styles.slogan}>
          {`"Un Espacio Para Tú Brujo Interior"`}
        </Text>
      </View>

      {/* Modal de error */}
      <Modal
        visible={showErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeErrorModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[
              styles.modalTitle,
              { color: errorType === 'connection' ? '#ff6b35' : '#ff4757' }
            ]}>
              {getErrorTitle()}
            </Text>
            <Text style={styles.modalMessage}>
              {getErrorMessage()}
            </Text>
            <TouchableOpacity 
              style={[
                styles.modalButton,
                { backgroundColor: getModalButtonColor() }
              ]} 
              onPress={closeErrorModal}
            >
              <Text style={styles.modalButtonText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e', // Fondo oscuro místico
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerContainer: {
    width: '90%',
    alignItems: 'center',
    padding: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Contenedor semi-transparente
    borderWidth: 2,
    borderColor: '#8b5cf6', // Borde púrpura
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#fbbf24', // Borde dorado
  },
  title: {
    fontSize: 28,
    color: '#fbbf24', // Dorado místico
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
    fontFamily: 'cursive',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#e5e7eb', // Gris claro
    alignSelf: 'flex-start',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    height: 45,
    borderColor: '#8b5cf6', // Borde púrpura
    borderWidth: 2,
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    color: '#1a1a2e',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#8b5cf6', // Púrpura místico
    paddingVertical: 12,
    paddingHorizontal: 35,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#fbbf24', // Borde dorado
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  slogan: {
    marginTop: 28,
    fontStyle: 'italic',
    color: '#10b981', // Verde místico
    fontSize: 20,
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  loadingText: {
    fontSize: 18,
    color: '#fbbf24',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  // Estilos del modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 15,
    padding: 25,
    margin: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  modalMessage: {
    fontSize: 16,
    color: '#e5e7eb',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 24,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 35,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#fbbf24',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
}); 