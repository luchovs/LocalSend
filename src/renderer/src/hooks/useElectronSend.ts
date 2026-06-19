import { useState, useEffect } from 'react'

export interface MobileDevice {
  alias: string
  ip: string
  deviceType: string
}

export interface ProgressData {
  fileName: string
  percentage: number
  speed: string
  eta: number
}

const electronAPI = (window as any).api
const DEFAULT_ALIAS = 'Mi PC'

export function useElectronSend() {
  const [devices, setDevices] = useState<MobileDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<MobileDevice | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressData | null>(null)
  const [alias, setAlias] = useState<string>(DEFAULT_ALIAS)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState(DEFAULT_ALIAS)
  const [networkError, setNetworkError] = useState<{ message: string; recoverable: boolean } | null>(null)

  useEffect(() => {
    if (!electronAPI) return

    electronAPI.onLoadAlias((savedAlias: string) => {
      setAlias(savedAlias)
      setAliasInput(savedAlias)
    })

    electronAPI.onDeviceDiscovered((device: MobileDevice) => {
      setDevices((prev) => {
        if (prev.some((d) => d.ip === device.ip)) return prev
        return [...prev, device]
      })
    })

    electronAPI.onTransferProgress((data: ProgressData) => {
      setProgress(data)
      setNetworkError(null)
    })

    electronAPI.onTransferComplete(() => {
      setProgress(null)
      setNetworkError(null)
    })

    electronAPI.onTransferError((errorMsg: string) => {
      setProgress(null)
      if (errorMsg === 'omitido') return

      if (errorMsg === 'rechazado') {
        setNetworkError({ 
          message: 'El dispositivo de destino rechazó el archivo entrante.', 
          recoverable: true 
        })
      } else if (errorMsg.startsWith('recoverable:')) {
        setNetworkError({ message: 'Se perdió la conexión. Podés reintentar el envío desde el celular.', recoverable: true })
      } else if (errorMsg.startsWith('fatal:')) {
        setNetworkError({ message: 'Error de transferencia. Verificá la red.', recoverable: false })
      } else {
        setNetworkError({ message: errorMsg, recoverable: false })
      }
    })
  }, [])

  const saveAlias = () => {
    const trimmed = aliasInput.trim() || DEFAULT_ALIAS
    setAlias(trimmed)
    setAliasInput(trimmed)
    electronAPI?.setAlias(trimmed)
    setEditingAlias(false)
  }

  const handleDragOver = (e: React.DragEvent) => { 
    e.preventDefault()
    setIsDragging(true) 
  }
  
  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setNetworkError(null)
    if (!selectedDevice) { 
      alert('¡Primero seleccioná un dispositivo de la lista!')
      return 
    }
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0] as any
      if (electronAPI?.sendFileToDevice) {
        const ab = await file.arrayBuffer()
        electronAPI.sendFileToDevice(Array.from(new Uint8Array(ab)), file.name, selectedDevice.ip)
      }
    }
  }

  const dismissError = () => setNetworkError(null)
  const startEditingAlias = () => setEditingAlias(true)
  const cancelEditingAlias = () => { 
    setEditingAlias(false)
    setAliasInput(alias) 
  }

  return {
    devices,
    selectedDevice,
    setSelectedDevice,
    isDragging,
    progress,
    alias,
    editingAlias,
    aliasInput,
    setAliasInput,
    networkError,
    saveAlias,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    dismissError,
    startEditingAlias,
    cancelEditingAlias
  }
}