import { contextBridge, ipcRenderer } from 'electron'

// Estructura de API segura para que React hable con el proceso Main de Node
const api = {
  // Enviar acciones al Main
  sendPing: () => ipcRenderer.send('ping'),
  
  // 🌟 AGREGÁ ESTA LÍNEA MÁGICA:
  sendFileToDevice: (filePath: string, fileName: string, targetIp: string) => 
    ipcRenderer.send('send-file-to-device', { filePath, fileName, targetIp }),
  // Escuchadores del ciclo de transferencia y red
  onServerStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status))
  },
  onDeviceDiscovered: (callback: (device: { alias: string; ip: string; deviceType: string }) => void) => {
    ipcRenderer.on('device-discovered', (_event, device) => callback(device))
  },
  onTransferProgress: (callback: (progress: { bytes: number; percentage: number; speed: string; eta: number; fileName: string }) => void) => {
    ipcRenderer.on('transfer-progress', (_event, progress) => callback(progress))
  },
  onTransferComplete: (callback: (filePath: string) => void) => {
    ipcRenderer.on('transfer-complete', (_event, filePath) => callback(filePath))
  },
  onTransferError: (callback: (errorMsg: string) => void) => {
    ipcRenderer.on('transfer-error', (_event, errorMsg) => callback(errorMsg))
  }
}

// Exponer en el Main World de forma segura si el aislamiento está activo
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Error exponiendo la API segura:', error)
  }
} else {
  // @ts-ignore fallback para desarrollo antiguo
  window.api = api
} 