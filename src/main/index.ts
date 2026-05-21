import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import dgram from 'node:dgram'
import net from 'node:net' // <-- NUEVO: Servidor TCP
import fs from 'node:fs' // <-- NUEVO: Sistema de archivos nativo

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    initUDPServer()
    initTCPServer() // <-- NUEVO: Inicializar servidor de archivos
  })
}

// Servidor UDP para Service Discovery (Puerto 53317 obligado por la rúbrica)
function initUDPServer(): void {
  const udpServer = dgram.createSocket('udp4')
  const UDP_PORT = 53317

  udpServer.on('listening', () => {
    const address = udpServer.address()
    console.log(`[UDP] Servidor escuchando en ${address.address}:${address.port}`)

    // Le avisamos al Frontend que el servidor está ONLINE (LED Verde)
    mainWindow?.webContents.send('server-status', true)
  })

  udpServer.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString())

      // Detectamos si un dispositivo móvil nos está buscando en la red local
      if (data.type === 'BEACON_DISCOVER') {
        console.log(`[UDP] Dispositivo móvil detectado en: ${rinfo.address}`)

        // Enviamos los datos del dispositivo al Frontend (Lista dinámica de la UI)
        mainWindow?.webContents.send('device-discovered', {
          alias: data.alias || 'Dispositivo Anónimo',
          ip: rinfo.address,
          deviceType: data.deviceType || 'mobile'
        })

        // Respondemos inmediatamente al celular para que él también nos agende
        const response = JSON.stringify({
          type: 'BEACON_RESPONSE',
          alias: 'Cool Desktop Node', // Nombre amigable de tu PC
          deviceType: 'desktop'
        })

        udpServer.send(response, rinfo.port, rinfo.address)
      }
    } catch (error) {
      console.error('[UDP] Error al decodificar paquete:', error)
    }
  })

  udpServer.on('error', (err) => {
    console.error(`[UDP] Error en el socket: ${err.message}`)
    mainWindow?.webContents.send('server-status', false) // Servidor caído (LED Rojo)
    udpServer.close()
  })

  // Enlazamos al puerto global
  udpServer.bind(UDP_PORT)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function initTCPServer(): void {
  const TCP_PORT = 53318

  const tcpServer = net.createServer((socket) => {
    console.log(`[TCP] Conexión entrante desde: ${socket.remoteAddress}`)

    let writeStream: fs.WriteStream | null = null
    let receivedBytes = 0
    let totalBytes = 0 // En una fase posterior leeremos los metadatos reales primero

    // Ruta temporal para guardar lo que llegue en la carpeta Descargas del usuario
    const downloadFolder = app.getPath('downloads')
    const targetPath = join(downloadFolder, 'LocalSend_Recibido.bin')

    // Creamos el stream de escritura obligatorio para no bloquear el hilo de la UI
    writeStream = fs.createWriteStream(targetPath)

    socket.on('data', (chunk) => {
      receivedBytes += chunk.length

      // Intentamos escribir el fragmento directo a disco
      const canWrite = writeStream!.write(chunk)

      // Control de Backpressure: Si el disco está saturado, pausamos el socket de red
      if (!canWrite) {
        socket.pause()
        writeStream!.once('drain', () => {
          socket.resume() // Reanudamos cuando el disco se libere
        })
      }

      // Enviamos feedback del progreso base a la interfaz de usuario
      mainWindow?.webContents.send('transfer-progress', {
        bytes: receivedBytes,
        // Mandamos un porcentaje simulado o crudo por ahora
        percentage: Math.min(100, Math.round((receivedBytes / (1024 * 1024)) * 10))
      })
    })

    socket.on('end', () => {
      if (writeStream) {
        writeStream.end()
        console.log(`[TCP] Archivo guardado con éxito en: ${targetPath}`)
        mainWindow?.webContents.send('transfer-complete', targetPath)
      }
    })

    socket.on('error', (err) => {
      console.error(`[TCP] Error en la transferencia: ${err.message}`)
      if (writeStream) writeStream.end()
    })
  })

  tcpServer.listen(TCP_PORT, () => {
    console.log(`[TCP] Servidor de transferencia escuchando en el puerto ${TCP_PORT}`)
  })
}
