import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import dgram from 'node:dgram'
import net from 'node:net'
import fs from 'node:fs'
import * as http from 'node:http'

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
    initTCPServer()
    initHTTPServer()
  })
}

// Servidor UDP para Service Discovery (Puerto 53317)
function initUDPServer(): void {
  const udpServer = dgram.createSocket('udp4')
  const UDP_PORT = 53317

  udpServer.on('listening', () => {
    const address = udpServer.address()
    console.log(`[UDP] Servidor escuchando en ${address.address}:${address.port}`)
    mainWindow?.webContents.send('server-status', true) // LED Verde
  })

  udpServer.on('message', (msg, rinfo) => {
    const rawMessage = msg.toString().trim()
    console.log(`[UDP] Llegó un paquete desde ${rinfo.address}: "${rawMessage}"`)

    // Plantilla de respuesta JSON para el celular
    const responseMessage = JSON.stringify({
      type: 'BEACON_RESPONSE',
      alias: 'Cool Desktop Node',
      deviceType: 'desktop'
    })

    // 1. Manejo de Texto Plano (LocalSend oficial o ráfagas crudas)
    if (rawMessage === 'DISCOVER_LOCALSEND' || rawMessage.includes('DISCOVER')) {
      console.log(`[UDP] Petición de texto plano aceptada de forma segura. Respondiendo...`)
      udpServer.send(responseMessage, rinfo.port, rinfo.address)

      mainWindow?.webContents.send('device-discovered', {
        alias: 'Celular Detectado',
        ip: rinfo.address,
        deviceType: 'mobile'
      })
      return
    }

    // 2. Manejo de formato JSON (Estructura propia)
    try {
      const data = JSON.parse(rawMessage)

      if (data.type === 'BEACON_DISCOVER') {
        mainWindow?.webContents.send('device-discovered', {
          alias: data.alias || 'Dispositivo Móvil',
          ip: rinfo.address,
          deviceType: data.deviceType || 'mobile'
        })

        udpServer.send(responseMessage, rinfo.port, rinfo.address)
      }
    } catch (error) {
      console.error(
        '[UDP] No se pudo parsear como JSON, pero el servidor evita el crash y sigue activo.'
      )
    }
  })

  udpServer.on('error', (err) => {
    console.error(`[UDP] Error en el socket: ${err.message}`)
    mainWindow?.webContents.send('server-status', false) // LED Rojo
    udpServer.close()
  })

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

// Servidor TCP para recibir archivos (Puerto 53318)
function initTCPServer(): void {
  const TCP_PORT = 53318

  const tcpServer = net.createServer((socket) => {
    console.log(`[TCP] Conexión entrante desde: ${socket.remoteAddress}`)

    let writeStream: fs.WriteStream | null = null
    let receivedBytes = 0

    const downloadFolder = app.getPath('downloads')
    const targetPath = join(downloadFolder, 'LocalSend_Recibido.bin')

    writeStream = fs.createWriteStream(targetPath)

    socket.on('data', (chunk) => {
      receivedBytes += chunk.length
      const canWrite = writeStream!.write(chunk)

      if (!canWrite) {
        socket.pause()
        writeStream!.once('drain', () => {
          socket.resume()
        })
      }

      mainWindow?.webContents.send('transfer-progress', {
        bytes: receivedBytes,
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

// Servidor HTTP para responder los Pings del Radar (Puerto 53319)
function initHTTPServer(): void {
  const HTTP_PORT = 53319

  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST')

    if (req.url === '/ping' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          type: 'BEACON_RESPONSE',
          alias: 'Cool Desktop Node',
          deviceType: 'desktop'
        })
      )
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Servidor de descubrimiento para Expo Go listo en el puerto ${HTTP_PORT}`)
  })
}
