import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../contexts/supabase';

const AVATAR_BUCKET = 'avatars';
const initialUser = null;

export default function UserScreen({ navigation }) {
  const [user, setUser] = useState(initialUser);
  const [edit, setEdit] = useState(false);
  const [tempUser, setTempUser] = useState({ nombre: '', email: '', telefono: '', direccion: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        setLoading(true);
        const stored = await AsyncStorage.getItem('userSession');
        if (!stored) {
          Alert.alert('Error', 'No hay sesión de usuario activa');
          navigation.replace('Register');
          return;
        }
        
        const sessionUser = JSON.parse(stored);
        console.log('Usuario de sesión cargado:', sessionUser);
        
        if (!sessionUser?.id) {
          Alert.alert('Error', 'Usuario no válido');
          navigation.replace('Register');
          return;
        }

        // Cargar datos frescos desde Supabase
        const { data, error } = await supabase
          .from('cliente')
          .select('id, nombre, email, telefono, direccion, imagen, posiones')
          .eq('id', sessionUser.id)
          .single();

        if (error) {
          console.error('Error cargando datos de Supabase:', error);
          Alert.alert('Error', 'No se pudo cargar la información del usuario desde la base de datos');
          return;
        }

        if (!data) {
          Alert.alert('Error', 'Usuario no encontrado en la base de datos');
          navigation.replace('Register');
          return;
        }

        // Combinar datos de sesión con datos de Supabase
        const merged = { ...sessionUser, ...data };
        console.log('Usuario combinado:', merged);
        
        setUser(merged);
        setTempUser({
          nombre: merged?.nombre || '',
          email: merged?.email || '',
          telefono: merged?.telefono || '',
          direccion: merged?.direccion || '',
        });
        
        // Actualizar sesión con datos frescos
        await AsyncStorage.setItem('userSession', JSON.stringify(merged));
        
      } catch (err) {
        console.error('Error loading user:', err);
        Alert.alert('Error', 'No se pudo cargar la información del usuario');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [navigation]);

  const handleEdit = () => {
    setTempUser({
      nombre: user?.nombre || '',
      email: user?.email || '',
      telefono: user?.telefono || '',
      direccion: user?.direccion || '',
    });
    setEdit(true);
  };

  const base64ToUint8Array = (base64) => {
    const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
    const binaryString = globalThis.atob ? atob(cleaned) : Buffer.from(cleaned, 'base64').toString('binary');
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const uploadAvatarFromUri = async (uri, mimeType, originalFileName) => {
    if (!user?.id) {
      Alert.alert('Error', 'No hay usuario válido para actualizar la imagen');
      return;
    }
    try {
      setUploading(true);
      const filenameExt = (originalFileName?.split('.').pop() || uri.split('.').pop() || 'jpg').toLowerCase();
      const extension = filenameExt.includes('?') ? 'jpg' : filenameExt;
      const contentType = mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      const filePath = `profiles/${user.id}/${Date.now()}.${extension}`;

      let arrayBuffer;
      try {
        const response = await fetch(uri);
        arrayBuffer = await response.arrayBuffer();
      } catch (e) {
        arrayBuffer = undefined;
      }

      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        try {
          const FileSystem = await import('expo-file-system');
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          const bytes = base64ToUint8Array(base64);
          arrayBuffer = bytes.buffer;
        } catch (fsErr) {
          console.warn('FileSystem fallback failed:', fsErr);
          Alert.alert('Error', 'No se pudo leer la imagen seleccionada.');
          setUploading(false);
          return;
        }
      }

      let uploadBody = arrayBuffer;
      try {
        uploadBody = new Blob([arrayBuffer], { type: contentType });
      } catch (e) {}

      let uploadPath = filePath;
      let { data: uploadData, error: uploadError } = await supabase
        .storage
        .from(AVATAR_BUCKET)
        .upload(filePath, uploadBody, { contentType, cacheControl: '3600', upsert: true });

      if (uploadError) {
        console.warn('Upload directo falló, intentando URL firmada. Detalle:', uploadError);
        const { data: signedData, error: signedErr } = await supabase
          .storage
          .from(AVATAR_BUCKET)
          .createSignedUploadUrl(filePath);

        if (signedErr || !signedData?.token) {
          console.error('createSignedUploadUrl error:', signedErr);
          Alert.alert('Error al subir imagen', signedErr?.message || uploadError.message || 'No se pudo preparar la subida.');
          setUploading(false);
          return;
        }

        const { error: signedUploadErr } = await supabase
          .storage
          .from(AVATAR_BUCKET)
          .uploadToSignedUrl(signedData.path, signedData.token, uploadBody, { contentType });

        if (signedUploadErr) {
          console.error('uploadToSignedUrl error:', signedUploadErr);
          Alert.alert('Error al subir imagen', signedUploadErr.message || 'No se pudo subir la imagen.');
          setUploading(false);
          return;
        }

        uploadPath = signedData.path;
      }

      const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(uploadPath);
      const publicUrl = publicData?.publicUrl;

      const { data: updateData, error: updateError } = await supabase
        .from('cliente')
        .update({ imagen: publicUrl })
        .eq('id', user.id)
        .select('id, nombre, email, telefono, direccion, imagen, posiones')
        .single();

      if (updateError) {
        Alert.alert('Error al guardar imagen', updateError.message || 'No se pudo actualizar tu perfil.');
        setUploading(false);
        return;
      }

      const merged = { ...user, ...updateData };
      setUser(merged);
      await AsyncStorage.setItem('userSession', JSON.stringify(merged));
      Alert.alert('Listo', 'Imagen de perfil actualizada');
    } catch (err) {
      console.error('uploadAvatarFromUri exception:', err);
      Alert.alert('Error', 'Ocurrió un error al seleccionar/subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const pickAndUploadImage = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'No hay usuario válido para actualizar la imagen');
      return;
    }
    try {
      setUploading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        console.log('pickAndUploadImage: permisos no concedidos');
        Alert.alert('Permisos', 'Se requieren permisos para acceder a tu galería');
        setUploading(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) {
        setUploading(false);
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setUploading(false);
        return;
      }
      await uploadAvatarFromUri(asset.uri, asset.mimeType, asset.fileName);
    } catch (err) {
      Alert.alert('Error', 'Ocurrió un error al seleccionar/subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'No hay usuario válido para actualizar');
      return;
    }
    setSaving(true);
    try {
      const updates = {
        nombre: (tempUser.nombre || '').trim(),
        email: (tempUser.email || '').trim(),
        telefono: (tempUser.telefono || '').trim(),
        direccion: (tempUser.direccion || '').trim(),
      };

      const { data, error } = await supabase
        .from('cliente')
        .update(updates)
        .eq('id', user.id)
        .select('id, nombre, email, telefono, direccion, imagen, posiones')
        .single();

      if (error) {
        const message = [
          error.message ? `Mensaje: ${error.message}` : null,
          error.code ? `Código: ${error.code}` : null,
          error.details ? `Detalles: ${error.details}` : null,
          error.hint ? `Sugerencia: ${error.hint}` : null,
        ].filter(Boolean).join('\n');
        Alert.alert('Error al guardar', message || 'No se pudo actualizar el usuario.');
        return;
      }

      const merged = { ...user, ...data };
      setUser(merged);
      await AsyncStorage.setItem('userSession', JSON.stringify(merged));
      setEdit(false);
      Alert.alert('Listo', 'Información actualizada');
    } catch (err) {
      console.error('Update exception:', err);
      Alert.alert('Error', 'Ocurrió un error al actualizar');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#00cfff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>USUARIO</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityLabel="Cerrar sesión">
          <MaterialCommunityIcons name="logout-variant" size={22} color="#fbbf24" />
        </TouchableOpacity>
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

      {/* Perfil */}
      <View style={styles.profileContainer}>
        <TouchableOpacity activeOpacity={0.7} onPress={pickAndUploadImage} disabled={uploading}>
          {user?.imagen ? (
            <Image source={{ uri: user.imagen }} style={styles.avatar} />
          ) : (
            <Image source={require('../assets/icon.png')} style={styles.avatar} />
          )}
          {uploading && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
          <TouchableOpacity
            style={styles.editBadge}
            onPress={pickAndUploadImage}
            activeOpacity={0.8}
          >
            <Text style={styles.editBadgeText}>✎</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        <View style={styles.infoContainer}>
          <Text style={styles.infoLabel}>Nombre:</Text>
          <Text style={styles.infoText}>{user?.nombre || '-'}</Text>
          <Text style={styles.infoLabel}>Email:</Text>
          <Text style={styles.infoText}>{user?.email || '-'}</Text>
          <Text style={styles.infoLabel}>Teléfono:</Text>
          <Text style={styles.infoText}>{user?.telefono || '-'}</Text>
          <Text style={styles.infoLabel}>Dirección:</Text>
          <Text style={styles.infoText}>{user?.direccion || '-'}</Text>
          <Text style={styles.infoLabel}>Posiones:</Text>
          <Text style={[styles.infoText, { color: '#fbbf24', fontWeight: 'bold' }]}>{user?.posiones || 0} 🧪</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
        <Text style={styles.editBtnText}>EDITAR</Text>
      </TouchableOpacity>

      {/* Modal de edición */}
      <Modal visible={edit} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <View style={styles.modalContentForm}>
            <Text style={styles.modalTitle}>Editar usuario</Text>
            <TextInput style={styles.input} value={tempUser.nombre} onChangeText={v => setTempUser({ ...tempUser, nombre: v })} placeholder="Nombre" />
            <TextInput style={styles.input} value={tempUser.email} onChangeText={v => setTempUser({ ...tempUser, email: v })} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={tempUser.telefono} onChangeText={v => setTempUser({ ...tempUser, telefono: v })} placeholder="Teléfono" keyboardType="phone-pad" />
            <TextInput style={styles.input} value={tempUser.direccion} onChangeText={v => setTempUser({ ...tempUser, direccion: v })} placeholder="Dirección" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity style={[
                styles.saveBtn,
                saving ? { opacity: 0.7 } : null,
              ]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEdit(false)}><Text style={styles.saveBtnText}>Cancelar</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    width: '100%', backgroundColor: '#8b5cf6', padding: 15, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: '#fbbf24', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    flexDirection: 'row', justifyContent: 'center', position: 'relative',
  },
  headerText: { color: '#fbbf24', fontSize: 24, fontWeight: 'bold', fontFamily: 'cursive', textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 3 },
  logoutButton: { position: 'absolute', right: 15, top: '50%', marginTop: -20, width: 40, height: 40, backgroundColor: '#dc2626', borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fbbf24', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  logoutButtonText: { color: '#fbbf24', fontSize: 20, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },

  profileContainer: { alignItems: 'center', marginTop: 30, marginBottom: 20, paddingHorizontal: 16 },
  avatar: { width: 90, height: 90, borderRadius: 45, marginBottom: 20, backgroundColor: '#fff', borderWidth: 2, borderColor: '#8b5cf6' },
  infoContainer: { width: '100%', alignItems: 'center' },
  infoLabel: { fontWeight: 'bold', color: '#e5e7eb', fontSize: 15 },
  infoText: { color: '#cbd5e1', marginBottom: 8, fontSize: 15 },
  editBtn: { backgroundColor: '#8b5cf6', padding: 12, borderRadius: 8, marginTop: 10, marginBottom: 20, width: '60%', alignItems: 'center', borderWidth: 2, borderColor: '#fbbf24', alignSelf: 'center' },
  editBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 15, padding: 25, margin: 20, alignItems: 'center', borderWidth: 2, borderColor: '#8b5cf6' },
  modalContentForm: { backgroundColor: '#1a1a2e', borderRadius: 15, padding: 25, margin: 20, width: 320, borderWidth: 2, borderColor: '#8b5cf6' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#fbbf24' },
  modalMessage: { fontSize: 16, color: '#e5e7eb', textAlign: 'center', marginBottom: 25, lineHeight: 24 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 10 },
  modalButton: { flex: 1, marginHorizontal: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 2, borderColor: '#fbbf24' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  input: { borderWidth: 1, borderColor: '#8b5cf6', borderRadius: 8, marginBottom: 10, padding: 10, fontSize: 15, backgroundColor: 'rgba(255,255,255,0.9)' },
  saveBtn: { backgroundColor: '#10b981', padding: 10, borderRadius: 8, flex: 1, alignItems: 'center', marginRight: 5, borderWidth: 2, borderColor: '#fbbf24' },
  cancelBtn: { backgroundColor: '#dc2626', padding: 10, borderRadius: 8, flex: 1, alignItems: 'center', marginLeft: 5, borderWidth: 2, borderColor: '#fbbf24' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },

  footer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', width: '100%', backgroundColor: '#8b5cf6', padding: 10, position: 'absolute', bottom: 0, height: 70, borderTopWidth: 3, borderTopColor: '#fbbf24', zIndex: 10, shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  footerIcon: { fontSize: 28, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
}); 