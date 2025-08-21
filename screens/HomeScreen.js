import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView, Platform, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../contexts/supabase';
import { MaterialIcons } from '@expo/vector-icons';

const categories = [
  [
    { key: 'cafe', label: 'Café', db: ['cafe'] },
    { key: 'te', label: 'Té', db: ['te-frio', 'te-caliente'] },
  ],
  [
    { key: 'bebidas', label: 'Bebidas', db: ['bebida-fria', 'bebida-caliente'] },
    { key: 'frappe', label: 'Frappe', db: ['frappes'] },
  ],
  [
    { key: 'malteada', label: 'Malteada', db: ['malteadas'] },
    { key: 'postres', label: 'Postres', db: ['postres'] },
  ],
];

// Agregar estilos globales para la barra de scroll en web
if (Platform.OS === 'web') {
  document.body.style.overflow = 'auto'; // Permite el scroll global en web
  const style = document.createElement('style');
  style.innerHTML = `
    ::-webkit-scrollbar {
      width: 10px;
      background: #222;
    }
    ::-webkit-scrollbar-thumb {
      background: #39FF14;
      border-radius: 6px;
      border: 2px solid #000;
    }
    ::-webkit-scrollbar-track {
      background: #000;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(style);
}

  // Función para manejar URLs de imágenes de manera segura
  const normalizeImageUrl = (url, fallback) => {
    const imageUrl = url?.trim() || fallback?.trim() || '';
    
    // Si no hay URL, retornar vacío
    if (!imageUrl) return null;
    
    // Si es una URL válida, la usamos
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return imageUrl;
    }
    
    // Si no es una URL válida, retornar vacío para usar defaultSource
    return null;
  };

// Función para obtener la URL pública de la imagen
const getImageUrl = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Elimina todos los prefijos 'productos/' del path
  const cleanPath = raw.replace(/^(productos\/)+/, '');
  return `https://czvsmndotmafwmvrnwyb.supabase.co/storage/v1/object/public/productos/${cleanPath}`;
};

export default function HomeScreen({ navigation, route }) {
  const [potions, setPotions] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('cafe');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  
  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('producto')
      .select('id, nombre, valor_pociones, precio, categoria, descripcion, imagen');
    if (!error && data) {
      // Enriquecer con URL de imagen resolviendo desde Supabase Storage
      const enriched = (data || []).map((p) => {
        const imageUrl = getImageUrl(p.imagen);
        return { ...p, imageUrl };
      });
      setProducts(enriched);
    }
  }, []);

  useEffect(() => {
    // Obtener el usuario de los parámetros de navegación
    const userData = route.params?.user;
    if (userData) {
      setUser(userData);
      setPotions(userData.posiones ?? 0);
    }
  }, [route.params]);

  // Actualizar el contador de posiones desde BD
  const fetchUserPotions = async () => {
    try {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('cliente')
        .select('posiones')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setPotions(data.posiones ?? 0);
      }
    } catch (e) {
      // opcional: loguear
    }
  };

  // Polling cada 30s solo para posiones
  useEffect(() => {
    if (!user?.id) return;
    // primera carga
    fetchUserPotions();
    const intervalId = setInterval(() => {
      fetchUserPotions();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      setLoading(true);
      await fetchProducts();
      if (isMounted) setLoading(false);
    };
    loadInitial();

    const intervalId = setInterval(() => {
      fetchProducts();
    }, 30000); // 30 segundos

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [fetchProducts]);

  // Obtener la lista de categorías seleccionadas
  const selectedDbCategories = categories.flat().find(cat => cat.key === selectedCategory)?.db || [];

  // Filtrar productos según la(s) categoría(s) seleccionada(s)
  const filteredProducts = products.filter(p => selectedDbCategories.includes((p.categoria || '').toLowerCase()));

  const handleRedeem = async (product) => {
    if (!user?.id) {
      alert('No hay usuario válido para realizar el canje');
      return;
    }
    if (!product?.id) {
      alert('Producto inválido');
      return;
    }
    if (potions >= product.valor_pociones) {
      try {
        const { data, error } = await supabase
          .from('canje')
          .insert([
            {
              cliente: user.id,
              producto: product.id,
              status: 'pendiente',
            },
          ])
          .select('id')
          .single();

        if (error || !data) {
          console.error('Error al crear canje:', error);
          alert(`No se pudo iniciar el canje. Detalle: ${error?.message || 'Error desconocido'}`);
          return;
        }

        const canjeId = data.id;

      navigation.navigate('QR', { 
        productId: product.id,
        productName: product.nombre,
        potionsCost: product.valor_pociones,
          user: user,
          canjeId: canjeId,
      });
      } catch (e) {
        console.error('Excepción al crear canje:', e);
        alert(`No se pudo iniciar el canje. Detalle: ${e?.message || 'Error desconocido'}`);
      }
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const logoutUser = async () => {
    try {
      await AsyncStorage.removeItem('userSession');
      setShowLogoutModal(false);
      navigation.replace('Register');
    } catch (error) {
      setShowLogoutModal(false);
      alert('No se pudo cerrar la sesión');
    }
  };

  return (
    <View style={{ flex: 1, position: 'relative', minHeight: Platform.OS === 'web' ? '100vh' : undefined }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>cafeteria aquellarre</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={24} color="#fbbf24" />
        </TouchableOpacity>
      </View>

      {/* Modal personalizado para cerrar sesión */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
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

      {/* Content Area */}
      <View style={{ flex: 1 }}>
        {/* Potions Counter */}
        <Text style={styles.potionsText}>
          <Text style={styles.potionsLabel}>CUENTAS CON </Text>
          <Text style={styles.potionsNumber}>{potions}</Text>
          <Text style={styles.potionsLabel}> POCIONES</Text>
        </Text>

        {/* Categories Grid */}
        <View style={styles.gridContainer}>
          {categories.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.gridRow}>
              {row.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.gridItem, selectedCategory === cat.key && styles.selectedGridItem]}
              onPress={() => setSelectedCategory(cat.key)}
            >
              <Text style={styles.gridText}>{cat.label}</Text>
            </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Products List */}
        {loading ? (
          <ActivityIndicator size={48} color="#00cfff" style={styles.loader} />
        ) : (
          <View style={styles.productsContainer}>
            <ScrollView 
              style={{ flex: 1 }}
              contentContainerStyle={styles.scrollViewContent}
              showsVerticalScrollIndicator={true}
            >
              {selectedCategory === 'te' || selectedCategory === 'bebidas' ? (
                <>
                  {selectedDbCategories.map((dbCat, idx) => (
                    <React.Fragment key={dbCat}>
                      {filteredProducts.filter(p => (p.categoria || '').toLowerCase() === dbCat).length > 0 && (
                        <View style={styles.subcategorySeparator}>
                          <Text style={styles.subcategorySeparatorText}>
                            {dbCat === 'te-frio' ? 'Té Frío' : dbCat === 'te-caliente' ? 'Té Caliente' : dbCat === 'bebida-fria' ? 'Bebida Fría' : 'Bebida Caliente'}
                          </Text>
                        </View>
                      )}
              {filteredProducts
                        .filter(p => (p.categoria || '').toLowerCase() === dbCat)
                        .sort((a, b) => a.valor_pociones - b.valor_pociones)
                        .map((item) => {
                          const canAfford = potions >= item.valor_pociones;
                          return (
                            <View key={item.id} style={[
                              styles.productTag,
                              !canAfford && styles.disabledProductTag
                            ]}>
                              <Image
                                source={getImageUrl(item.imagen) ? { uri: getImageUrl(item.imagen) } : require('../assets/icon.png')}
                                style={styles.productImg}
                                resizeMode="cover"
                                onError={(e) => console.warn('Error cargando imagen:', getImageUrl(item.imagen), e.nativeEvent.error)}
                              />
                    <View style={styles.productInfo}>
                                <Text style={[
                                  styles.productName,
                                  !canAfford && styles.disabledText
                                ]}>{item.nombre}</Text>
                                <Text style={[
                                  styles.productDesc,
                                  !canAfford && styles.disabledText
                                ]}>{item.descripcion}</Text>
                      <View style={styles.productDetailsRow}>
                                  <Text style={[
                                    styles.productDetail,
                                    !canAfford && styles.disabledText
                                  ]}>Pociones: {item.valor_pociones}</Text>
                                  <Text style={[
                                    styles.productDetail,
                                    !canAfford && styles.disabledText
                                  ]}>Precio: {item.precio} $</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                                style={[
                                  styles.iconBox,
                                  !canAfford && styles.disabledIconBox
                                ]}
                      onPress={() => handleRedeem(item)}
                                disabled={!canAfford}
                    >
                      <Image 
                                  source={require('../assets/canje.png')}
                                  style={[
                                    styles.icon,
                                    !canAfford && styles.disabledIcon
                                  ]}
                      />
                    </TouchableOpacity>
                  </View>
                          );
                        })}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                filteredProducts
                  .sort((a, b) => a.valor_pociones - b.valor_pociones)
                  .map((item) => {
                    const canAfford = potions >= item.valor_pociones;
                    return (
                      <View key={item.id} style={[
                        styles.productTag,
                        !canAfford && styles.disabledProductTag
                      ]}>
                        <Image
                          source={getImageUrl(item.imagen) ? { uri: getImageUrl(item.imagen) } : require('../assets/icon.png')}
                          style={styles.productImg}
                          resizeMode="cover"
                          onError={(e) => console.warn('Error cargando imagen:', getImageUrl(item.imagen), e.nativeEvent.error)}
                        />
                        <View style={styles.productInfo}>
                          <Text style={[
                            styles.productName,
                            !canAfford && styles.disabledText
                          ]}>{item.nombre}</Text>
                          <Text style={[
                            styles.productDesc,
                            !canAfford && styles.disabledText
                          ]}>{item.descripcion}</Text>
                          <View style={styles.productDetailsRow}>
                            <Text style={[
                              styles.productDetail,
                              !canAfford && styles.disabledText
                            ]}>Pociones: {item.valor_pociones}</Text>
                            <Text style={[
                              styles.productDetail,
                              !canAfford && styles.disabledText
                            ]}>Precio: {item.precio} $</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.iconBox,
                            !canAfford && styles.disabledIconBox
                          ]}
                          onPress={() => handleRedeem(item)}
                          disabled={!canAfford}
                        >
                          <Image
                            source={require('../assets/canje.png')}
                            style={[
                              styles.icon,
                              !canAfford && styles.disabledIcon
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Footer Navigation */}
      <View style={[styles.footer, Platform.OS === 'web' ? styles.footerWeb : null]}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.footerIcon}>🔔</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Text style={styles.footerIcon}>🏠</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('User')}>
          <Text style={styles.footerIcon}>👤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#000000', // Fondo negro
  },
  header: {
    width: '100%',
    backgroundColor: '#8b5cf6', // Púrpura místico
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#fbbf24', // Borde dorado
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
    color: '#fbbf24', // Dorado místico
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'cursive',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 90, // Más espacio para el footer superpuesto
  },
  potionsText: {
    margin: 15,
    fontSize: 18,
    color: '#e5e7eb', // Gris claro
    textAlign: 'center',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  potionsLabel: {
    fontStyle: 'italic',
    fontSize: 18,
    color: '#fbbf24', // Dorado místico
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  potionsNumber: {
    fontSize: 20,
    color: '#10b981', // Verde místico
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  gridContainer: {
    marginBottom: 10,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridItem: {
    width: '45%',
    margin: 5,
    backgroundColor: 'rgba(139, 92, 246, 0.2)', // Púrpura semi-transparente
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedGridItem: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)', // Dorado semi-transparente
    borderColor: '#fbbf24',
  },
  gridText: {
    fontSize: 16,
    color: '#e5e7eb',
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  productsContainer: {
    flex: 1,
    marginHorizontal: 10,
    borderRadius: 15,
    backgroundColor: '#000', // Fondo negro para el área de productos
    paddingVertical: 5,
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 90, // Asegura que el último producto no quede oculto
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6', // Violeta místico para las etiquetas
    marginVertical: 12,
    padding: 28,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#fbbf24', // Borde dorado
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
    alignSelf: 'center',
    width: '98%',
    maxWidth: 700,
    minHeight: 120,
  },
  productImg: {
    width: 90,
    height: 90,
    borderRadius: 16,
    overflow: 'hidden',
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productName: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#ffffff', // Texto blanco sobre fondo violeta
  },
  productDesc: {
    color: '#e5e7eb', // Gris claro
    fontSize: 13,
  },
  productDetailsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  productDetail: {
    color: '#ffffff', // Texto blanco
    fontSize: 13,
    marginRight: 12,
    fontWeight: 'bold',
  },
  iconBox: {
    width: 70,
    height: 70,
    backgroundColor: '#fbbf24', // Dorado místico
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16,
    borderWidth: 2,
    borderColor: '#8b5cf6', // Borde púrpura
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledIconBox: {
    backgroundColor: '#6b7280', // Gris deshabilitado
    borderColor: '#9ca3af',
  },
  icon: {
    width: 54,
    height: 54,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#8b5cf6', // Púrpura místico
    padding: 10,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    borderTopWidth: 3,
    borderTopColor: '#fbbf24', // Borde dorado
    zIndex: 10,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  footerWeb: {
    position: 'fixed',
  },
  footerIcon: {
    fontSize: 28,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  disabledProductTag: {
    opacity: 0.7, // Hace que la etiqueta se vea más tenue
    backgroundColor: '#6b7280', // Fondo gris para las etiquetas deshabilitadas
    borderColor: '#9ca3af',
  },
  disabledText: {
    color: '#9ca3af', // Texto gris para las descripciones deshabilitadas
  },
  disabledIcon: {
    opacity: 0.5, // Hace que el icono se vea más tenue
  },
  logoutButton: {
    position: 'absolute',
    right: 15,
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    backgroundColor: '#dc2626', // Rojo oscuro
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fbbf24', // Borde dorado
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutButtonText: {
    color: '#fbbf24', // Dorado místico
    fontSize: 20,
    fontWeight: 'bold',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    color: '#fbbf24',
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
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
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
  subcategorySeparator: {
    backgroundColor: '#222',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 10,
    alignSelf: 'center',
  },
  subcategorySeparatorText: {
    color: '#fbbf24',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
    textAlign: 'center',
  },
}); 