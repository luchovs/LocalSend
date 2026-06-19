import { contextBridge, ipcRenderer } from 'electron'

const api = {
  sendPing: () => ipcRenderer.send('ping'),
  setAlias: (alias: string) => ipcRenderer.send('set-alias', alias),
  sendFileToDevice: (fileBytes: number[], fileName: string, targetIp: string) =>
    ipcRenderer.send('send-file-to-device', { fileBytes, fileName, targetIp }),
  onLoadAlias: (callback: (alias: string) => void) => {
    ipcRenderer.on('load-alias', (_event, alias) => callback(alias))
  },
  onServerStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.on('server-status', (_event, status) => callback(status))
  },
  onDeviceDiscovered: (callback: (device: { alias: string; ip: string; deviceType: string }) => void) => {
    ipcRenderer.on('device-discovered', (_event, device) => callback(device))
  },
  onTransferProgress: (callback: (progress: { percentage: number; speed: string; eta: number; fileName: string }) => void) => {
    ipcRenderer.on('transfer-progress', (_event, progress) => callback(progress))
  },
  onTransferComplete: (callback: (filePath: string) => void) => {
    ipcRenderer.on('transfer-complete', (_event, filePath) => callback(filePath))
  },
  onTransferError: (callback: (errorMsg: string) => void) => {
    ipcRenderer.on('transfer-error', (_event, errorMsg) => callback(errorMsg))
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Error exponiendo la API:', error)
  }
} else {
  // @ts-ignore
  window.api = api
}