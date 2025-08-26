import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../contexts/supabase';

export default function NotificationsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const getUserAndFetch = async () => {
      try {
        setLoading(true);
        const stored = await AsyncStorage.getItem('userSession');
        if (stored) {
          const userObj = JSON.parse(stored);
          setUser(userObj);
          await fetchNotifications(userObj.id, true);
        }
      } catch (e) {
        // noop
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    getUserAndFetch();

    // Actualizar notificaciones cada 20 segundos
    const intervalId = setInterval(() => {
      if (user?.id) {
        try {
          fetchNotifications(user.id);
        } catch (error) {
          // Error en actualización automática
        }
      }
    }, 20000); // 20 segundos

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [user?.id]);

  const fetchNotifications = async (clienteId, isInitialLoad = false) => {
    if (!isInitialLoad) {
      setUpdating(true);
    }
    
    try {
      const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('id_usuario', clienteId)
        .order('fecha', { ascending: false });

      if (error) {
        if (isInitialLoad) {
          Alert.alert('Error', 'No se pudieron cargar las notificaciones');
        }
      } else {
        setNotifications(data || []);
        // Limpia claimedIds para evitar inconsistencias
      }
    } catch (error) {
      if (isInitialLoad) {
        Alert.alert('Error', 'Error al conectar con la base de datos');
      }
    } finally {
      if (!isInitialLoad) {
        setUpdating(false);
      }
    }
  };

  const deleteNotification = async (notificationId) => {
    if (!user?.id) {
      Alert.alert('Error', 'Usuario no válido para eliminar la notificación');
      return;
    }
    const previousNotifications = notifications;
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    try {
      const { error } = await supabase
        .from('notificaciones')
        .delete()
        .eq('id', notificationId)
        .eq('id_usuario', user.id)
        .select();

      if (error) {
        setNotifications(previousNotifications);
        const message = [
          error.message ? `Mensaje: ${error.message}` : null,
          error.code ? `Código: ${error.code}` : null,
          error.details ? `Detalles: ${error.details}` : null,
          error.hint ? `Sugerencia: ${error.hint}` : null,
        ].filter(Boolean).join('\n');
        Alert.alert('Error', message || 'No se pudo eliminar la notificación.');
      } else {
        await fetchNotifications(user.id, true);
      }
    } catch (error) {
      setNotifications(previousNotifications);
      Alert.alert('Error', 'Error al eliminar la notificación');
    }
  };

  const handleLogout = () => setShowLogoutModal(true);
  const logoutUser = async () => {
    try {
      await AsyncStorage.removeItem('userSession');
      setShowLogoutModal(false);
      navigation.replace('Register');
    } catch (e) {
      setShowLogoutModal(false);
      alert('No se pudo cerrar la sesión');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>NOTIFICACIONES</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityLabel="Cerrar sesión">
          <MaterialCommunityIcons name="logout-variant" size={22} color="#fbbf24" />
        </TouchableOpacity>
        {/* Indicador de actualización */}
        {updating && (
          <View style={styles.updateIndicator}>
            <ActivityIndicator size="small" color="#fbbf24" />
          </View>
        )}
      </View>

      {/* Modal de logout */}
      <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => setShowLogoutModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cerrar Sesión</Text>
            <Text style={styles.modalMessage}>¿Estás seguro que deseas cerrar sesión?</Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#8b5cf6' }]} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.modalButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#dc2626' }]} onPress={logoutUser}>
                <Text style={styles.modalButtonText}>Cerrar Sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator size={48} color="#00cfff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item?.id?.toString()}
          contentContainerStyle={{ paddingBottom: 90 }}
          renderItem={({ item }) => {
            return (
              <View style={styles.notification}>
                <Text style={styles.notificationText}>{item?.titulo || 'Notificación'}</Text>
                {!!(item?.descripción || item?.descripcion) && (
                  <Text style={[styles.notificationText, { color: '#cbd5e1', marginTop: 6 }]}>
                    {(item?.descripción || item?.descripcion)}
                  </Text>
                )}
                {!!item?.recompensa && (
                  <Text style={[styles.notificationText, { color: '#10b981', marginTop: 6, fontWeight: 'bold' }]}>🎁 {item.recompensa}</Text>
                )}
                {!!item?.fecha && (
                  <Text style={[styles.notificationText, { color: '#9ca3af', marginTop: 6, fontStyle: 'italic' }]}>
                    {new Date(item.fecha).toLocaleDateString()}
                  </Text>
                )}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteNotification(item.id)}>
                    <Text style={styles.btnText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No tienes notificaciones.</Text>}
          style={{ width: '100%' }}
        />
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}><Text style={styles.footerIcon}>🔔</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}><Text style={styles.footerIcon}>🏠</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('User')}><Text style={styles.footerIcon}>👤</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    width: '100%',
    backgroundColor: '#8b5cf6',
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#fbbf24',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'relative',
  },
  headerText: {
    color: '#fbbf24',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'cursive',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  logoutButton: {
    position: 'absolute', right: 15, top: '50%', marginTop: -20,
    width: 40, height: 40, backgroundColor: '#dc2626', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fbbf24',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  logoutButtonText: { color: '#fbbf24', fontSize: 20, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  updateIndicator: {
    position: 'absolute',
    left: 15,
    top: '50%',
    marginTop: -10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notification: { backgroundColor: '#2f3142', margin: 10, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#8b5cf6' },
  notificationText: { fontSize: 16, color: '#e5e7eb', marginBottom: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  deleteBtn: { backgroundColor: '#dc2626', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 2, borderColor: '#fbbf24' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 30 },
  potionsInfo: { margin: 10, fontSize: 16, color: '#e5e7eb', textAlign: 'center' },

  footer: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#8b5cf6', padding: 10, position: 'absolute', left: 0, right: 0, bottom: 0, height: 70,
    borderTopWidth: 3, borderTopColor: '#fbbf24', zIndex: 10,
    shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  footerIcon: { fontSize: 28, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 15, padding: 25, margin: 20, alignItems: 'center', borderWidth: 2, borderColor: '#8b5cf6' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#fbbf24' },
  modalMessage: { fontSize: 16, color: '#e5e7eb', textAlign: 'center', marginBottom: 25, lineHeight: 24 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 10 },
  modalButton: { flex: 1, marginHorizontal: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 2, borderColor: '#fbbf24' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
}); 