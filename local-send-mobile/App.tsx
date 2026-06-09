import React, { useState, useEffect } from 'react'
import { 
  StyleSheet, Text, View, TouchableOpacity, FlatList, 
  ActivityIndicator, useColorScheme, StatusBar, Alert
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

interface DiscoveredDevice {
  alias: string
  ip: string
  deviceType: string
}

interface SelectedFile {
  name: string
  size: number
  uri: string
}

interface IncomingFile {
  name: string
  size: number
  ip: string
}

export default function App() {
  const systemTheme = useColorScheme()
  const isDark = systemTheme === 'dark'

  const [isWifi, setIsWifi] = useState<boolean | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [baseIp, setBaseIp] = useState<string>('')
  
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [sending, setSending] = useState<boolean>(false)
  const [sendProgress, setSendProgress] = useState<number>(0)

  // Estados para recibir archivos desde la PC
  const [incomingFile, setIncomingFile] = useState<IncomingFile | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [receiveProgress, setReceiveProgress] = useState(0)

  // 1. Validar red y calcular raíz IP
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnectedToWifi = state.isConnected && state.type === 'wifi'
      setIsWifi(isConnectedToWifi)

      if (isConnectedToWifi && state.details && 'ipAddress' in state.details) {
        const ip = state.details.ipAddress as string
        const segments = ip.split('.')
        if (ip.startsWith('10.')) {
          segments.pop()
          segments.pop()
          setBaseIp(segments.join('.') + '.')
        } else {
          segments.pop()
          setBaseIp(segments.join('.') + '.')
        }
      }
    })
    return () => unsubscribe()
  }, [])

  // 2. Polling a las PCs descubiertas para ver si hay archivos pendientes
  useEffect(() => {
    if (devices.length === 0) return

    const interval = setInterval(async () => {
      if (receiving || incomingFile) return

      for (const device of devices) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 1500)
          
          const res = await fetch(`http://${device.ip}:53319/pending`, {
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          
          const data = await res.json()
          console.log(`[POLLING] ${device.ip}:`, JSON.stringify(data))  // ← para ver qué responde
          
          if (data.fileName) {
            setIncomingFile({ name: data.fileName, size: data.fileSize, ip: device.ip })
            break
          }
        } catch (err) {
          console.log(`[POLLING] Error en ${device.ip}:`, err)  // ← para ver si hay errores
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [devices, receiving, incomingFile])

  // 3. Escáner adaptativo inteligente
  const scanNetwork = async () => {
    if (!baseIp) return
    setLoading(true)
    setDevices([])

    const promises = []
    if (baseIp.startsWith('10.')) {
      const subredesColegio = [2, 5]
      for (const subred of subredesColegio) {
        for (let i = 1; i <= 254; i++) {
          promises.push(pingDevice(`${baseIp}${subred}.${i}`))
        }
      }
    } else {
      for (let i = 1; i <= 254; i++) {
        promises.push(pingDevice(`${baseIp}${i}`))
      }
    }

    await Promise.all(promises)
    setLoading(false)
  }

  const pingDevice = (targetIp: string) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600)

    return fetch(`http://${targetIp}:53319/ping`, {
      method: 'GET',
      signal: controller.signal
    })
      .then((res) => res.json())
      .then((data) => {
        clearTimeout(timeoutId)
        if (data.type === 'BEACON_RESPONSE') {
          setDevices((prev) => {
            if (prev.some((d) => d.ip === targetIp)) return prev
            return [...prev, { alias: data.alias, ip: targetIp, deviceType: data.deviceType }]
          })
        }
      })
      .catch(() => clearTimeout(timeoutId))
  }

  // 4. Selector de archivos
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      })
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        setSelectedFile({ name: asset.name, size: asset.size || 0, uri: asset.uri })
      }
    } catch (err) {
      console.error('Error al seleccionar archivo:', err)
    }
  }

  // 5. Envío de archivos celular → PC (sin cambios)
  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) return
    setSending(true)
    setSendProgress(0)

    try {
      const metaResponse = await fetch(`http://${targetIp}:53319/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, size: selectedFile.size })
      })
      const metaData = await metaResponse.json()
      if (metaData.status !== 'ACCEPTED') {
        alert('La PC rechazó el envío.')
        setSending(false)
        return
      }

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `http://${targetIp}:53319/meta`)
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          setSendProgress(Math.round((event.loaded / event.total) * 100))
        }
      })
      xhr.onload = () => { setSending(false); setSelectedFile(null); alert('¡Archivo enviado con éxito!') }
      xhr.onerror = () => { setSending(false); alert('Error de red.') }

      const formData = new FormData()
      formData.append('file', { uri: selectedFile.uri, name: selectedFile.name, type: 'application/octet-stream' } as any)
      xhr.send(formData)
    } catch (error) {
      console.error(error)
      setSending(false)
      alert('Error de conexión con la PC.')
    }
  }

  // 6. Descarga de archivos PC → Celular
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

    // Guardar en caché con la API nueva
    const file = new File(Paths.cache, incomingFile.name)
    await file.write(base64, { encoding: 'base64' } as any)

    setReceiveProgress(100)

    // Abrir el diálogo nativo de guardar/compartir
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Guardar ${incomingFile.name}`,
      UTI: 'public.item'
    })

    setIncomingFile(null)
  } catch (err) {
    console.error('Error al descargar:', err)
    alert('Error al descargar: ' + err)
  } finally {
    setReceiving(false)
    setReceiveProgress(0)
  }
}

  const handleIncomingFile = () => {
    if (!incomingFile) return
    Alert.alert(
      '📥 Archivo entrante',
      `La PC quiere enviarte:\n"${incomingFile.name}"\n(${(incomingFile.size / 1024).toFixed(1)} KB)`,
      [
        { text: 'Rechazar', style: 'cancel', onPress: () => setIncomingFile(null) },
        { text: 'Descargar', onPress: downloadFile }
      ]
    )
  }

  const dynamicStyles = StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: isDark ? '#121214' : '#f5f5f7', 
      paddingTop: 60, 
      paddingHorizontal: 20 
    },
    text: { color: isDark ? '#fff' : '#000' },
    card: {
      backgroundColor: isDark ? '#1e1e24' : '#ffffff',
      borderColor: isDark ? '#2a2a32' : '#e0e0e0',
      borderWidth: 1,
      padding: 15,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      elevation: 2
    }
  })

  if (isWifi === false) {
    return (
      <View style={dynamicStyles.container}>
        <Text style={[styles.errorText, { color: '#F44336' }]}>⚠️ Se requiere conexión Wi-Fi</Text>
      </View>
    )
  }

  return (
    <View style={dynamicStyles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>LocalSend Pro</Text>

      {/* --- BANNER DE ARCHIVO ENTRANTE --- */}
      {incomingFile && !receiving && (
        <TouchableOpacity
          style={[styles.incomingBanner, { backgroundColor: isDark ? '#1a2e1a' : '#e8f5e9' }]}
          onPress={handleIncomingFile}
        >
          <Text style={styles.incomingIcon}>📥</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.incomingTitle, { color: isDark ? '#81c784' : '#2e7d32' }]}>
              Archivo entrante desde la PC
            </Text>
            <Text style={[styles.incomingName, { color: isDark ? '#a5d6a7' : '#388e3c' }]} numberOfLines={1}>
              {incomingFile.name}
            </Text>
          </View>
          <Text style={styles.incomingAction}>Tocar</Text>
        </TouchableOpacity>
      )}

      {/* --- PROGRESO DE DESCARGA --- */}
      {receiving && (
        <View style={styles.progressBox}>
          <Text style={{ color: '#fff', marginBottom: 5 }}>Descargando: {receiveProgress}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${receiveProgress}%`, backgroundColor: '#2196F3' }]} />
          </View>
        </View>
      )}

      {/* --- SECCIÓN SELECTOR DE ARCHIVOS --- */}
      <View style={[styles.fileSection, { backgroundColor: isDark ? '#1e1e24' : '#eaf2ea' }]}>
        <Text style={[styles.fileStatus, { color: isDark ? '#a0a0b0' : '#444' }]}>
          {selectedFile ? `📂 Listo: ${selectedFile.name}` : 'Ningún archivo seleccionado'}
        </Text>
        <TouchableOpacity style={styles.pickerButton} onPress={pickFile}>
          <Text style={styles.pickerButtonText}>{selectedFile ? 'Cambiar' : 'Seleccionar Archivo'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progreso de envío */}
      {sending && (
        <View style={styles.progressBox}>
          <Text style={{ color: '#fff', marginBottom: 5 }}>Enviando: {sendProgress}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${sendProgress}%` }]} />
          </View>
        </View>
      )}

      {/* Botón del Radar */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={scanNetwork}
        disabled={loading || sending}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Buscar Computadoras</Text>}
      </TouchableOpacity>

      <Text style={[styles.subtitle, { color: isDark ? '#a0a0b0' : '#666' }]}>Dispositivos destinos detectados:</Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.ip}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={dynamicStyles.card} 
            onPress={() => sendFileToDevice(item.ip)}
            disabled={!selectedFile || sending}
          >
            <Text style={styles.cardIcon}>💻</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardAlias, { color: isDark ? '#fff' : '#222' }]}>{item.alias}</Text>
              <Text style={styles.cardIp}>{item.ip}</Text>
            </View>
            {selectedFile && !sending && <Text style={styles.sendBadge}>Tocar para enviar</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>No hay PCs en vista. Activá el radar de arriba.</Text> : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  subtitle: { fontSize: 14, marginTop: 15, marginBottom: 8, fontWeight: '600' },
  fileSection: { padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  fileStatus: { fontSize: 14, fontWeight: '500', marginBottom: 10, textAlign: 'center' },
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
  errorText: { textAlign: 'center', fontSize: 16, fontWeight: 'bold', marginTop: 40 },
  progressBox: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 15 },
  progressBarBg: { height: 8, backgroundColor: '#555', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' },
  incomingBanner: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#4CAF50'
  },
  incomingIcon: { fontSize: 24, marginRight: 12 },
  incomingTitle: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  incomingName: { fontSize: 14, fontWeight: 'bold' },
  incomingAction: { color: '#4CAF50', fontWeight: 'bold', fontSize: 12, marginLeft: 8 }
})