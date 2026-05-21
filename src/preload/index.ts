import { contextBridge, ipcRenderer } from 'electron'

// API limpia y nativa sin dependencias que rompan el sandbox
// Agrega estas funciones dentro del objeto 'api' en tu src/preload/index.ts
const api = {
  onServerStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status))
  },
  onDeviceDiscovered: (
    callback: (device: { alias: string; ip: string; deviceType: string }) => void
  ) => {
    ipcRenderer.on('device-discovered', (_event, device) => callback(device))
  },
  // NUEVOS CANALES PARA EL FLUJO TCP:
  onTransferProgress: (callback: (progress: { percentage: number; speed: number }) => void) => {
    ipcRenderer.on('transfer-progress', (_event, progress) => callback(progress))
  },
  onTransferComplete: (callback: (filePath: string) => void) => {
    ipcRenderer.on('transfer-complete', (_event, filePath) => callback(filePath))
  }
}

// Exponer siempre de forma aislada
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Error exponiendo la API en el preload:', error)
}
