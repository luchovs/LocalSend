import React, { useState, useEffect } from 'react'
import { 
  StyleSheet, Text, View, TouchableOpacity, FlatList, 
  ActivityIndicator, useColorScheme, StatusBar 
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as DocumentPicker from 'expo-document-picker'

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

export default function App() {
  const systemTheme = useColorScheme() // Modo Claro u Oscuro Automático
  const isDark = systemTheme === 'dark'

  const [isWifi, setIsWifi] = useState<boolean | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [baseIp, setBaseIp] = useState<string>('')
  
  // Estados para el flujo de envío de archivos
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [sending, setSending] = useState<boolean>(false)
  const [sendProgress, setSendProgress] = useState<number>(0)

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

  // 2. Escáner adaptativo inteligente
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

  // 3. Selector de Archivos Nativo del Sistema (UX: Regla de los 3 clics)
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Permite cualquier extensión de archivo
        copyToCacheDirectory: true
      })

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        setSelectedFile({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri
        })
      }
    } catch (err) {
      console.error('Error al seleccionar archivo:', err)
    }
  }

  // 4. Motor de Envío Nativo Híbrido: Envía comandos por HTTP y lee binarios por XMLHttpRequest
  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) return
    setSending(true)
    setSendProgress(0)

    try {
      // Paso A: Avisar metadatos a la PC por HTTP (/meta)
      const metaResponse = await fetch(`http://${targetIp}:53319/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedFile.name,
          size: selectedFile.size
        })
      })

      const metaData = await metaResponse.json()
      if (metaData.status !== 'ACCEPTED') {
        alert('La PC rechazó el envío.')
        setSending(false)
        return
      }

      // Paso B: Cargar y empujar el archivo crudo por red usando una petición nativa controlada
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `http://${targetIp}:53319/meta`) // Usamos HTTP con Chunking para simular el canal TCP plano sin librerías nativas extras

      // Actualizar el porcentaje real en pantalla
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentage = Math.round((event.loaded / event.total) * 100)
          setSendProgress(percentage)
        }
      })

      xhr.onload = () => {
        setSending(false)
        setSelectedFile(null)
        alert('¡Archivo enviado con éxito!')
      }

      xhr.onerror = () => {
        setSending(false)
        alert('Error de red. Asegúrate de que la PC no cerró la app.')
      }

      // Creamos un formato FormData nativo para envolver el archivo del sistema
      const formData = new FormData()
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: 'application/octet-stream'
      } as any)

      xhr.send(formData)

    } catch (error) {
      console.error(error)
      setSending(false)
      alert('Error de conexión con la PC.')
    }
  }

  // Estilos adaptativos basados en el tema del celular
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

      {/* --- SECCIÓN SELECTOR DE ARCHIVOS (UX PRINCIPAL) --- */}
      <View style={[styles.fileSection, { backgroundColor: isDark ? '#1e1e24' : '#eaf2ea' }]}>
        <Text style={[styles.fileStatus, { color: isDark ? '#a0a0b0' : '#444' }]}>
          {selectedFile ? `📂 Listo: ${selectedFile.name}` : 'Ningún archivo seleccionado'}
        </Text>
        <TouchableOpacity style={styles.pickerButton} onPress={pickFile}>
          <Text style={styles.pickerButtonText}>{selectedFile ? 'Cambiar' : 'Seleccionar Archivo'}</Text>
        </TouchableOpacity>
      </View>

      {/* Animación/Monitor de Progreso Móvil */}
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
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50' }
})