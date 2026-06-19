import React, { useState, useEffect, useRef } from 'react'
import {
  StyleSheet, Text, View, TouchableOpacity, FlatList,
  ActivityIndicator, useColorScheme, StatusBar, Alert,
  TextInput, Modal, Image, Animated, Easing
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { File, Paths } from 'expo-file-system'
import * as FileSystemLegacy from 'expo-file-system/legacy'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DiscoveredDevice {
  alias: string
  ip: string
  deviceType: string
}

interface SelectedFile {
  name: string
  size: number
  uri: string
  isImage: boolean
  mimeType?: string
}

interface IncomingFile {
  name: string
  size: number
  ip: string
}

// ── Componente de radar animado ───────────────────────────────────────────────

function RadarAnimation({ isDark }: { isDark: boolean }) {
  const pulse1 = useRef(new Animated.Value(0)).current
  const pulse2 = useRef(new Animated.Value(0)).current
  const pulse3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true })
        ])
      )

    const a1 = createPulse(pulse1, 0)
    const a2 = createPulse(pulse2, 600)
    const a3 = createPulse(pulse3, 1200)
    
    a1.start(); a2.start(); a3.start()
    return () => { a1.stop(); a2.stop(); a3.stop() }
  }, [])

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#4CAF50',
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] }) }]
  })

  return (
    <View style={styles.radarContainer}>
      <Animated.View style={ringStyle(pulse1)} />
      <Animated.View style={ringStyle(pulse2)} />
      <Animated.View style={ringStyle(pulse3)} />
      <View style={[styles.radarCore, { backgroundColor: isDark ? '#1e1e24' : '#e8f5e9' }]}>
        <Text style={{ fontSize: 32 }}>📡</Text>
      </View>
      <Text style={[styles.radarLabel, { color: isDark ? '#a0a0b0' : '#666' }]}>Buscando...</Text>
    </View>
  )
}

// ── App principal ─────────────────────────────────────────────────────────────

export default function App() {
  const systemTheme = useColorScheme()
  const isDark = systemTheme === 'dark'

  const [isWifi, setIsWifi] = useState<boolean | null>(null)
  const [wifiLost, setWifiLost] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [baseIp, setBaseIp] = useState('')

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState(0)

  const [incomingFile, setIncomingFile] = useState<IncomingFile | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [receiveProgress, setReceiveProgress] = useState(0)

  const [alias, setAlias] = useState('Mi Celular')
  const [showAliasModal, setShowAliasModal] = useState(false)
  const [aliasInput, setAliasInput] = useState('Mi Celular')

  // 1. Validar red y calcular raíz IP con control de cortes bruscos
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected && state.type === 'wifi'

      if (isWifi === true && !connected) {
        setWifiLost(true)
        if (sending) {
          setSending(false)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          Alert.alert('⚠️ Wi-Fi perdido', 'Se interrumpió la conexión. El archivo sigue seleccionado para reintentar.')
        }
      }

      if (connected && wifiLost) {
        setWifiLost(false)
      }

      setIsWifi(connected)

      if (connected && state.details && 'ipAddress' in state.details) {
        const ip = state.details.ipAddress as string
        const segments = ip.split('.')
        segments.pop()
        setBaseIp(segments.join('.') + '.')
      }
    })
    return () => unsubscribe()
  }, [isWifi, wifiLost, sending])

  // 2. Polling a las PCs descubiertas
  useEffect(() => {
    if (devices.length === 0) return
    const interval = setInterval(async () => {
      if (receiving || incomingFile) return
      for (const device of devices) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 1500)
          const res = await fetch(`http://${device.ip}:53319/pending`, { signal: controller.signal })
          clearTimeout(timeoutId)
          const data = await res.json()
          if (data.fileName) {
            setIncomingFile({ name: data.fileName, size: data.fileSize, ip: device.ip })
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            break
          }
        } catch (_) {}
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [devices, receiving, incomingFile])

  // 3. Escáner de red con Haptics incorporado
  const scanNetwork = async () => {
    if (!baseIp) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setLoading(true)
    setDevices([])
    const promises: Promise<void>[] = []
    
    for (let i = 1; i <= 254; i++) {
      promises.push(pingDevice(`${baseIp}${i}`))
    }
    
    await Promise.all(promises)
    setLoading(false)
  }

  const pingDevice = (targetIp: string): Promise<void> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600)
    return fetch(`http://${targetIp}:53319/ping?alias=${encodeURIComponent(alias)}`, {
      method: 'GET', signal: controller.signal
    })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId)
        if (data.type === 'BEACON_RESPONSE') {
          setDevices(prev => {
            if (prev.some(d => d.ip === targetIp)) return prev
            return [...prev, { alias: data.alias, ip: targetIp, deviceType: data.deviceType }]
          })
        }
      })
      .catch(() => clearTimeout(timeoutId))
  }

  // 4a. Selector de documentos del sistema
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(asset.name)
        setSelectedFile({ 
          name: asset.name, 
          size: asset.size || 0, 
          uri: asset.uri, 
          isImage, 
          mimeType: asset.mimeType || undefined 
        })
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 4b. Selector de galería nativa con validación de permisos en Runtime
  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería para mandar fotos.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.9
      })
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        const fileName = asset.fileName || `IMG_${Date.now()}.jpg`
        setSelectedFile({
          name: fileName,
          size: asset.fileSize || 0,
          uri: asset.uri,
          isImage: asset.type === 'image',
          mimeType: asset.mimeType || undefined
        })
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const showFilePicker = () => {
    Alert.alert('Seleccionar archivo', '¿De dónde querés elegir el contenido?', [
      { text: '📁 Documentos / Archivos', onPress: pickDocument },
      { text: '🖼️ Galería de Fotos', onPress: pickFromGallery },
      { text: 'Cancelar', style: 'cancel' }
    ])
  }

  // 5. Envío celular → PC
  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSending(true)
    setSendProgress(0)
    try {
      const metaResponse = await fetch(`http://${targetIp}:53319/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size, senderAlias: alias })
      })
      const metaData = await metaResponse.json()
      if (metaData.status !== 'ACCEPTED') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        alert('La PC rechazó el envío.')
        setSending(false)
        return
      }
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `http://${targetIp}:53319/meta`)
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) setSendProgress(Math.round((event.loaded / event.total) * 100))
      })
      xhr.onload = () => {
        setSending(false)
        setSelectedFile(null)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('✅ Enviado', '¡Archivo enviado con éxito!')
      }
      xhr.onerror = () => {
        setSending(false)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('❌ Error', 'Error en la transferencia de red.')
      }
      const formData = new FormData()
      formData.append('file', { 
        uri: selectedFile.uri, 
        name: selectedFile.name, 
        type: selectedFile.mimeType || 'application/octet-stream' 
      } as any)
      xhr.send(formData)
    } catch (error) {
      setSending(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('❌ Desconectado', 'No se pudo establecer comunicación con la PC.')
    }
  }

  // 6. Descarga PC → Celular
  const downloadFile = async () => {
    if (!incomingFile) return
    setReceiving(true)
    setReceiveProgress(0)
    try {
      const res = await fetch(`http://${incomingFile.ip}:53319/send`)
      if (!res.ok) throw new Error('Error en la descarga')
      const blob = await res.blob()
      setReceiveProgress(50)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      setReceiveProgress(80)
      const permissions = await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (permissions.granted) {
        const mimeType = incomingFile.name.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
          : incomingFile.name.endsWith('.png') ? 'image/png'
          : incomingFile.name.endsWith('.pdf') ? 'application/pdf'
          : incomingFile.name.endsWith('.mp4') ? 'video/mp4'
          : 'application/octet-stream'
        const newUri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(
          permissions.directoryUri, incomingFile.name, mimeType
        )
        await FileSystemLegacy.StorageAccessFramework.writeAsStringAsync(newUri, base64, { encoding: 'base64' as any })
        setReceiveProgress(100)
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('✅ Guardado', `"${incomingFile.name}" guardado correctamente.`)
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('Permiso denegado', 'No se guardó el archivo.')
      }
      setIncomingFile(null)
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('❌ Error', 'Fallo al procesar descarga.')
    } finally {
      setReceiving(false)
    }
  }

const handleIncomingFile = () => {
  if (!incomingFile) return
  Alert.alert(
    '📥 Archivo entrante',
    `La PC quiere enviarte:\n"${incomingFile.name}"`,
    [
      { 
        text: 'Rechazar', 
        style: 'cancel', 
        onPress: async () => {
          try {
            // Le avisamos activamente a la PC que descarte el envío
            await fetch(`http://${incomingFile.ip}:53319/reject`, { method: 'POST' })
          } catch (e) {
            console.error('No se pudo notificar el rechazo a la PC', e)
          } finally {
            setIncomingFile(null) // Recién ahí limpiamos la UI local
          }
        } 
      },
      { text: 'Descargar', onPress: downloadFile }
    ]
  )
}

  const saveAlias = () => {
    const trimmed = aliasInput.trim() || 'Mi Celular'
    setAlias(trimmed)
    setAliasInput(trimmed)
    setShowAliasModal(false)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const dynamicStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#121214' : '#f5f5f7', paddingTop: 60, paddingHorizontal: 20 },
    card: {
      backgroundColor: isDark ? '#1e1e24' : '#ffffff',
      borderColor: isDark ? '#2a2a32' : '#e0e0e0',
      borderWidth: 1, padding: 15, borderRadius: 12,
      flexDirection: 'row', alignItems: 'center', marginBottom: 10, elevation: 2
    }
  })

  if (isWifi === false) {
    return (
      <View style={[dynamicStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📶</Text>
        <Text style={[styles.errorText, { color: '#F44336' }]}>Se requiere conexión Wi-Fi</Text>
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
          {wifiLost ? 'Conexión interrumpida. El archivo sigue listo en la cola para cuando reconectes.' : 'Asegurate de estar en la misma subred local.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={dynamicStyles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>LocalSend</Text>
        <TouchableOpacity
          style={[styles.aliasButton, { borderColor: isDark ? '#3a3a45' : '#ddd' }]}
          onPress={() => { setAliasInput(alias); setShowAliasModal(true) }}
        >
          <Text style={[styles.aliasButtonText, { color: isDark ? '#a0a0b0' : '#555' }]}>✏️ {alias}</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Alias */}
      <Modal visible={showAliasModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: isDark ? '#1e1e24' : '#fff' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? '#fff' : '#111' }]}>¿Cómo te llamás?</Text>
            <TextInput
              style={[styles.modalInput, { color: isDark ? '#fff' : '#111', borderColor: isDark ? '#3a3a45' : '#ddd', backgroundColor: isDark ? '#2a2a32' : '#f5f5f7' }]}
              value={aliasInput}
              onChangeText={setAliasInput}
              maxLength={32}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAliasModal(false)}>
                <Text style={{ color: '#888', fontWeight: 'bold' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveAlias}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Banner Entrada */}
      {incomingFile && !receiving && (
        <TouchableOpacity style={[styles.incomingBanner, { backgroundColor: isDark ? '#1a2e1a' : '#e8f5e9' }]} onPress={handleIncomingFile}>
          <Text style={styles.incomingIcon}>📥</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.incomingTitle, { color: isDark ? '#81c784' : '#2e7d32' }]}>Archivo entrante</Text>
            <Text style={[styles.incomingName, { color: isDark ? '#a5d6a7' : '#388e3c' }]} numberOfLines={1}>{incomingFile.name}</Text>
          </View>
          <Text style={styles.incomingAction}>Ver</Text>
        </TouchableOpacity>
      )}

      {/* Progreso Recibir */}
      {receiving && (
        <View style={styles.progressBox}>
          <Text style={{ color: '#fff', marginBottom: 5 }}>Descargando: {receiveProgress}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${receiveProgress}%`, backgroundColor: '#2196F3' }]} />
          </View>
        </View>
      )}

      {/* Selector Híbrido + Vista Previa Miniatura */}
      <View style={[styles.fileSection, { backgroundColor: isDark ? '#1e1e24' : '#eaf2ea' }]}>
        {selectedFile?.isImage ? (
          <View style={styles.previewRow}>
            <Image source={{ uri: selectedFile.uri }} style={styles.thumbnail} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileStatus, { color: isDark ? '#fff' : '#444', textAlign: 'left' }]} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Text style={{ color: '#888', fontSize: 12 }}>{(selectedFile.size / 1024).toFixed(1)} KB</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.fileStatus, { color: isDark ? '#a0a0b0' : '#444' }]}>
            {selectedFile ? `📂 ${selectedFile.name}` : 'Ningún archivo seleccionado'}
          </Text>
        )}
        <TouchableOpacity style={styles.pickerButton} onPress={showFilePicker}>
          <Text style={styles.pickerButtonText}>{selectedFile ? 'Cambiar Origen' : 'Seleccionar Archivo'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progreso Envío + Miniatura en tramo */}
      {sending && (
        <View style={styles.progressBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
            {selectedFile?.isImage && <Image source={{ uri: selectedFile.uri }} style={styles.progressThumbnail} />}
            <Text style={{ color: '#fff', flex: 1 }} numberOfLines={1}>Enviando... ({sendProgress}%)</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${sendProgress}%` }]} />
          </View>
        </View>
      )}

      {/* Radar Animado */}
      {loading ? (
        <RadarAnimation isDark={isDark} />
      ) : (
        <TouchableOpacity style={[styles.button, sending && styles.buttonDisabled]} onPress={scanNetwork} disabled={sending}>
          <Text style={styles.buttonText}>🔍 Buscar Computadoras</Text>
        </TouchableOpacity>
      )}

      {/* Lista de Destinos */}
      {!loading && (
        <>
          <Text style={[styles.subtitle, { color: isDark ? '#a0a0b0' : '#666' }]}>Dispositivos encontrados:</Text>
          <FlatList
            data={devices}
            keyExtractor={(item) => item.ip}
            renderItem={({ item }) => (
              <TouchableOpacity style={dynamicStyles.card} onPress={() => sendFileToDevice(item.ip)} disabled={!selectedFile || sending}>
                <Text style={styles.cardIcon}>💻</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardAlias, { color: isDark ? '#fff' : '#222' }]}>{item.alias}</Text>
                  <Text style={styles.cardIp}>{item.ip}</Text>
                </View>
                {selectedFile && !sending && <Text style={styles.sendBadge}>Mandar →</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No hay PCs en vista. Activá el radar de arriba.</Text>}
          />
        </>
      )}
    </View>
  )
}

// ── Estilos Complementarios ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold' },
  aliasButton: { borderWidth: 1, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  aliasButtonText: { fontSize: 13, fontWeight: '500' },
  subtitle: { fontSize: 14, marginTop: 15, marginBottom: 8, fontWeight: '600' },
  fileSection: { padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15, gap: 10 },
  fileStatus: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  thumbnail: { width: 50, height: 50, borderRadius: 8 },
  progressThumbnail: { width: 30, height: 30, borderRadius: 4 },
  pickerButton: { backgroundColor: '#2196F3', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  pickerButtonText: { color: '#fff', fontWeight: 'bold' },
  button: { backgroundColor: '#4CAF50', padding: 14, borderRadius: 10, alignItems: 'center', marginVertical: 5 },
  buttonDisabled: { backgroundColor: '#6ca86e' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cardIcon: { fontSize: 26, marginRight: 15 },
  cardAlias: { fontWeight: 'bold', fontSize: 16 },
  cardIp: { color: '#888', fontSize: 12 },
  sendBadge: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  errorText: { textAlign: 'center', fontSize: 18, fontWeight: 'bold' },
  progressBox: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 15 },
  progressBarBg: { height: 8, backgroundColor: '#555', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  incomingBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#4CAF50' },
  incomingIcon: { fontSize: 24, marginRight: 12 },
  incomingTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  incomingName: { fontSize: 14, fontWeight: 'bold' },
  incomingAction: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '80%', borderRadius: 16, padding: 24, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#2a2a32', alignItems: 'center' },
  modalSave: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center' },
  radarContainer: { alignItems: 'center', justifyContent: 'center', height: 140, marginVertical: 10 },
  radarCore: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  radarLabel: { marginTop: 8, fontSize: 12, fontStyle: 'italic' }
})