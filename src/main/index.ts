import { app, shell, BrowserWindow, ipcMain, Notification } from 'electron'
import { join, basename, extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import dgram from 'node:dgram'
import net from 'node:net'
import fs from 'node:fs'
import * as http from 'node:http'

let mainWindow: BrowserWindow | null = null
let currentFileMeta = { name: 'archivo.bin', size: 0 }

// Archivo pendiente de envío al celular
let pendingFile: { buffer: Buffer; name: string } | null = null

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
    mainWindow?.webContents.send('server-status', true)
  })

  udpServer.on('message', (msg, rinfo) => {
    const rawMessage = msg.toString().trim()
    console.log(`[UDP] Llegó un paquete desde ${rinfo.address}: "${rawMessage}"`)
    const responseMessage = JSON.stringify({
      type: 'BEACON_RESPONSE',
      alias: 'Cool Desktop Node',
      deviceType: 'desktop'
    })
    if (rawMessage === 'DISCOVER_LOCALSEND' || rawMessage.includes('DISCOVER')) {
      udpServer.send(responseMessage, rinfo.port, rinfo.address)
      mainWindow?.webContents.send('device-discovered', {
        alias: 'Celular Detectado',
        ip: rinfo.address,
        deviceType: 'mobile'
      })
      return
    }
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
    } catch {
      console.error('[UDP] No se pudo parsear como JSON, servidor sigue activo.')
    }
  })

  udpServer.on('error', (err) => {
    console.error(`[UDP] Error en el socket: ${err.message}`)
    mainWindow?.webContents.send('server-status', false)
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

  // ─── ENVÍO DE ARCHIVOS PC → CELULAR ───────────────────────────────────────
  // El celular no puede recibir conexiones entrantes, así que guardamos el
  // archivo en memoria y esperamos que el celular lo venga a buscar con GET /send
  ipcMain.on('send-file-to-device', (_event, data) => {
    const { fileBytes, fileName, targetIp } = data

    const fileBuffer = Buffer.from(fileBytes)
    const fileSize = fileBuffer.length

    console.log(`[SEND] Archivo "${fileName}" (${fileSize} bytes) listo. Esperando que el celular lo busque...`)

    // Guardar en memoria para que el celular lo descargue
    pendingFile = { buffer: fileBuffer, name: fileName }

    // Mostrar progreso en 0% inmediatamente para dar feedback visual
    mainWindow?.webContents.send('transfer-progress', {
      percentage: 0, speed: '—', eta: 0, fileName
    })

    // Notificar al celular vía UDP que hay un archivo disponible
    const udpNotify = dgram.createSocket('udp4')
    const msg = JSON.stringify({
      type: 'FILE_AVAILABLE',
      alias: 'Cool Desktop Node',
      fileName,
      fileSize
    })
    udpNotify.send(msg, 53317, targetIp, (err) => {
      if (err) console.error('[UDP Notify] Error enviando notificación:', err.message)
      else console.log(`[UDP Notify] Notificación enviada a ${targetIp}`)
      udpNotify.close()
    })
  })
  // ──────────────────────────────────────────────────────────────────────────

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
    console.log(`[TCP] Canal de datos abierto desde: ${socket.remoteAddress}`)
    let receivedBytes = 0
    const downloadFolder = app.getPath('downloads')

    let finalFileName = currentFileMeta.name
    let targetPath = join(downloadFolder, finalFileName)
    let counter = 1
    while (fs.existsSync(targetPath)) {
      const extension = extname(currentFileMeta.name)
      const baseName = basename(currentFileMeta.name, extension)
      finalFileName = `${baseName} (${counter})${extension}`
      targetPath = join(downloadFolder, finalFileName)
      counter++
    }
    const writeStream = fs.createWriteStream(targetPath)

    const startTime = Date.now()
    let lastTime = startTime
    let lastBytes = 0

    socket.on('data', (chunk) => {
      receivedBytes += chunk.length
      const canWrite = writeStream.write(chunk)
      if (!canWrite) {
        socket.pause()
        writeStream.once('drain', () => socket.resume())
      }
      const now = Date.now()
      if (now - lastTime > 400) {
        const timePassed = (now - startTime) / 1000
        const bytesSinceLast = receivedBytes - lastBytes
        const speedMBs = bytesSinceLast / (1024 * 1024) / ((now - lastTime) / 1000)
        const percentage = Math.min(100, Math.round((receivedBytes / (currentFileMeta.size || 1)) * 100))
        const remainingBytes = currentFileMeta.size - receivedBytes
        const avgSpeed = receivedBytes / timePassed
        const etaSeconds = avgSpeed > 0 ? Math.round(remainingBytes / avgSpeed) : 0
        mainWindow?.webContents.send('transfer-progress', {
          percentage, speed: speedMBs.toFixed(2), eta: etaSeconds, fileName: finalFileName
        })
        lastTime = now
        lastBytes = receivedBytes
      }
    })

    socket.on('end', () => { writeStream.end() })

    writeStream.on('finish', () => {
      console.log(`[TCP] Archivo guardado en: ${targetPath}`)
      mainWindow?.webContents.send('transfer-complete', targetPath)
      new Notification({
        title: 'LocalSend - Transferencia Exitosa',
        body: `Se recibió "${finalFileName}" correctamente.`
      }).show()
    })

    socket.on('error', (err) => {
      console.error(`[TCP] Error: ${err.message}`)
      writeStream.end()
      mainWindow?.webContents.send('transfer-error', err.message)
    })
  })

  tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`[TCP] Servidor de transferencia activo en puerto ${TCP_PORT}`)
  })
}

// Servidor HTTP para recibir comandos de control (Metadatos y Pings)
function initHTTPServer(): void {
  const HTTP_PORT = 53319
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // ── PING ──────────────────────────────────────────────────────────────
    if (req.url === '/ping' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ type: 'BEACON_RESPONSE', alias: 'Cool Desktop Node', deviceType: 'desktop' }))
      try {
        const remoteAddress = req.socket.remoteAddress || ''
        const clientIp = remoteAddress.replace(/^.*:/, '') || '192.168.0.88'
        mainWindow?.webContents.send('device-discovered', {
          alias: 'Celular de Lucho',
          ip: clientIp,
          deviceType: 'mobile'
        })
      } catch (err) {
        console.error('[HTTP] Error mandando IP al render:', err)
      }
    }

    // ── PENDING: el celular pregunta si hay un archivo esperándolo ─────────
    else if (req.url === '/pending' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(
        pendingFile
          ? { fileName: pendingFile.name, fileSize: pendingFile.buffer.length }
          : {}
      ))
    }

    // ── SEND: el celular descarga el archivo pendiente ─────────────────────
    else if (req.url === '/send' && req.method === 'GET') {
      if (!pendingFile) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'No hay archivo pendiente' }))
        return
      }

      const { buffer, name } = pendingFile
      console.log(`[HTTP] Sirviendo "${name}" (${buffer.length} bytes) al celular`)

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': buffer.length
      })

      const CHUNK = 64 * 1024
      let sent = 0

      const sendChunk = (offset: number) => {
        if (offset >= buffer.length) {
          pendingFile = null
          mainWindow?.webContents.send('transfer-progress', {
            percentage: 100, speed: '0', eta: 0, fileName: name
          })
          mainWindow?.webContents.send('transfer-complete', '')
          new Notification({
            title: 'LocalSend - Envío Exitoso',
            body: `"${name}" descargado por el celular correctamente.`
          }).show()
          res.end()
          return
        }
        const slice = buffer.subarray(offset, offset + CHUNK)
        sent += slice.length
        const percentage = Math.min(99, Math.round((sent / buffer.length) * 100))
        mainWindow?.webContents.send('transfer-progress', {
          percentage, speed: '—', eta: 0, fileName: name
        })
        res.write(slice, () => sendChunk(offset + CHUNK))
      }

      sendChunk(0)
    }

    // ── META: recepción de archivos desde el celular ───────────────────────
    else if (req.url === '/meta' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || ''

      // A. Metadatos JSON
      if (contentType.includes('application/json')) {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (data.files && Object.keys(data.files).length > 0) {
              const firstFileKey = Object.keys(data.files)[0]
              currentFileMeta = {
                name: data.files[firstFileKey].name || 'archivo.bin',
                size: data.files[firstFileKey].size || 0
              }
            } else {
              currentFileMeta = {
                name: data.name || 'archivo.bin',
                size: data.size || 0
              }
            }
            console.log(`[HTTP] Metadatos listos: ${currentFileMeta.name} (${currentFileMeta.size} bytes)`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ACCEPTED', message: 'Metadatos guardados' }))
          } catch {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Error parseando JSON' }))
          }
        })
      }

      // B. Stream de bytes (multipart)
      else {
        const downloadFolder = app.getPath('downloads')
        let filename = currentFileMeta.name || 'archivo_recibido.bin'
        let targetPath = join(downloadFolder, filename)
        let counter = 1
        while (fs.existsSync(targetPath)) {
          const extension = extname(filename)
          const baseName = basename(filename, extension)
          targetPath = join(downloadFolder, `${baseName} (${counter})${extension}`)
          counter++
        }
        console.log(`[HTTP Streaming] Escribiendo en: ${basename(targetPath)}`)
        const writeStream = fs.createWriteStream(targetPath)
        let receivedBytes = 0
        const chunks: Buffer[] = []

        req.on('data', (chunk) => {
          receivedBytes += chunk.length
          chunks.push(chunk)
          const totalSize = currentFileMeta.size || 1024 * 1024
          const percentage = Math.min(100, Math.round((receivedBytes / totalSize) * 100))
          mainWindow?.webContents.send('transfer-progress', {
            percentage, speed: '28.4', eta: 0, fileName: basename(targetPath)
          })
        })

        req.on('end', () => {
          const fullBuffer = Buffer.concat(chunks)
          const headerSeparator = Buffer.from('\r\n\r\n')
          const firstSeparatorIndex = fullBuffer.indexOf(headerSeparator)

          if (firstSeparatorIndex !== -1 && contentType.includes('multipart')) {
            const fileDataStart = firstSeparatorIndex + headerSeparator.length
            const boundaryStr = contentType.split('boundary=')[1]
            let fileDataEnd = fullBuffer.length
            if (boundaryStr) {
              const boundaryBuffer = Buffer.from('--' + boundaryStr)
              const lastBoundaryIndex = fullBuffer.lastIndexOf(boundaryBuffer)
              if (lastBoundaryIndex > fileDataStart) {
                fileDataEnd = lastBoundaryIndex - 2
              }
            }
            writeStream.write(fullBuffer.subarray(fileDataStart, fileDataEnd))
          } else {
            writeStream.write(fullBuffer)
          }
          writeStream.end()
        })

        writeStream.on('finish', () => {
          console.log(`[HTTP] Archivo guardado al 100%.`)
          mainWindow?.webContents.send('transfer-complete', targetPath)
          new Notification({
            title: 'LocalSend - Recibido',
            body: `Se guardó "${basename(targetPath)}" en Descargas.`
          }).show()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'SUCCESS' }))
        })

        req.on('error', (err) => {
          console.error('[HTTP Stream Error]', err)
          writeStream.end()
          res.writeHead(500)
          res.end()
        })
      }
    }

    // ── 404 ───────────────────────────────────────────────────────────────
    else {
      res.writeHead(404)
      res.end()
    }
  })

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP] Servidor de control unificado en puerto ${HTTP_PORT}`)
  })
}