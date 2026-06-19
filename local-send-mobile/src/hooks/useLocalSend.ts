import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import * as FileSystemLegacy from 'expo-file-system/legacy'

export interface DiscoveredDevice { alias: string; ip: string; deviceType: string }
export interface SelectedFile { name: string; size: number; uri: string; isImage: boolean; mimeType?: string }
export interface IncomingFile { name: string; size: number; ip: string }

export function useLocalSend() {
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

  // 1. Validar red
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected && state.type === 'wifi'
      if (isWifi === true && !connected) {
        setWifiLost(true)
        if (sending) {
          setSending(false)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          Alert.alert('⚠️ Wi-Fi perdido', 'Se interrumpió la conexión. El archivo sigue seleccionado.')
        }
      }
      if (connected && wifiLost) setWifiLost(false)
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

  // 2. Polling
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

  // 3. Escaneo
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
    return fetch(`http://${targetIp}:53319/ping?alias=${encodeURIComponent(alias)}`, { method: 'GET', signal: controller.signal })
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

  // 4. Archivos
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0]
      setSelectedFile({
        name: asset.name,
        size: asset.size || 0,
        uri: asset.uri,
        isImage: /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(asset.name),
        mimeType: asset.mimeType || undefined
      })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la galería.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9 })
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0]
      setSelectedFile({
        name: asset.fileName || `IMG_${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        uri: asset.uri,
        isImage: asset.type === 'image',
        mimeType: asset.mimeType || undefined
      })
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  // 5. Envío y Descarga
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
        Alert.alert('Rechazado', 'La PC rechazó el envío.')
        setSending(false)
        return
      }
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `http://${targetIp}:53319/meta`)
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setSendProgress(Math.round((e.loaded / e.total) * 100))
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
      formData.append('file', { uri: selectedFile.uri, name: selectedFile.name, type: selectedFile.mimeType || 'application/octet-stream' } as any)
      xhr.send(formData)
    } catch (error) {
      setSending(false)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('❌ Desconectado', 'No se pudo comunicar con la PC.')
    }
  }

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
        const newUri = await FileSystemLegacy.StorageAccessFramework.createFileAsync(permissions.directoryUri, incomingFile.name, mimeType)
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

  return {
    isWifi, wifiLost, loading, devices, alias, setAlias,
    selectedFile, setSelectedFile, sending, sendProgress,
    incomingFile, setIncomingFile, receiving, receiveProgress,
    scanNetwork, pickDocument, pickFromGallery, sendFileToDevice, downloadFile
  }
}