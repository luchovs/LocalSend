import { app, shell, BrowserWindow, ipcMain, Notification, dialog } from 'electron'
import { join, basename, extname } from 'path'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import dgram from 'node:dgram'
import net from 'node:net'
import fs from 'node:fs'
import * as http from 'node:http'

// ── Persistencia simple con JSON nativo (sin electron-store) ──────────────────
const configPath = path.join(app.getPath('userData'), 'config.json')

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(data: Record<string, any>): void {
  try {
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Config] Error guardando:', err)
  }
}
// ─────────────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let currentFileMeta = { name: 'archivo.bin', size: 0 }
let pendingFile: { buffer: Buffer; name: string } | null = null

// Alias persistido: se carga del disco al arrancar
let deviceAlias: string = readConfig().deviceAlias || 'Mi PC'

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
  mainWindow.on('ready-to-show', () => mainWindow?.show())
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
    mainWindow?.webContents.send('load-alias', deviceAlias)
    initUDPServer()
    initTCPServer()
    initHTTPServer()
  })
}

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
    const responseMessage = JSON.stringify({ type: 'BEACON_RESPONSE', alias: deviceAlias, deviceType: 'desktop' })

    if (rawMessage === 'DISCOVER_LOCALSEND' || rawMessage.includes('DISCOVER')) {
      udpServer.send(responseMessage, rinfo.port, rinfo.address)
      mainWindow?.webContents.send('device-discovered', { alias: 'Celular Detectado', ip: rinfo.address, deviceType: 'mobile' })
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
      console.error('[UDP] No se pudo parsear como JSON.')
    }
  })

  udpServer.on('error', (err) => {
    console.error(`[UDP] Error: ${err.message}`)
    mainWindow?.webContents.send('server-status', false)
    udpServer.close()
  })

  udpServer.bind(UDP_PORT)
}

// ── Helpers de colisión ───────────────────────────────────────────────────────

async function resolveCollision(targetPath: string, fileName: string): Promise<string | null> {
  if (!fs.existsSync(targetPath)) return targetPath
  if (!mainWindow) return null

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Archivo duplicado',
    message: `"${fileName}" ya existe en Descargas.`,
    detail: '¿Qué querés hacer?',
    buttons: ['Reemplazar', 'Mantener ambos', 'Omitir'],
    defaultId: 1,
    cancelId: 2
  })

  if (response === 0) {
    return targetPath
  } else if (response === 1) {
    const ext = extname(fileName)
    const base = basename(fileName, ext)
    const dir = targetPath.replace(fileName, '')
    let counter = 1
    let newPath = join(dir, `${base} (${counter})${ext}`)
    while (fs.existsSync(newPath)) {
      counter++
      newPath = join(dir, `${base} (${counter})${ext}`)
    }
    return newPath
  } else {
    return null
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('set-alias', (_event, alias: string) => {
    deviceAlias = alias || 'Mi PC'
    writeConfig({ ...readConfig(), deviceAlias })
    console.log(`[ALIAS] Guardado: "${deviceAlias}"`)
  })

  ipcMain.on('send-file-to-device', (_event, data) => {
    const { fileBytes, fileName, targetIp } = data
    const fileBuffer = Buffer.from(fileBytes)
    console.log(`[SEND] "${fileName}" (${fileBuffer.length} bytes) listo.`)
    pendingFile = { buffer: fileBuffer, name: fileName }
    mainWindow?.webContents.send('transfer-progress', { percentage: 0, speed: '—', eta: 0, fileName })

    const udpNotify = dgram.createSocket('udp4')
    const msg = JSON.stringify({ type: 'FILE_AVAILABLE', alias: deviceAlias, fileName, fileSize: fileBuffer.length })
    udpNotify.send(msg, 53317, targetIp, (err) => {
      if (err) console.error('[UDP Notify] Error:', err.message)
      udpNotify.close()
    })
  })

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── TCP ───────────────────────────────────────────────────────────────────────

function initTCPServer(): void {
  const TCP_PORT = 53318
  const tcpServer = net.createServer((socket) => {
    console.log(`[TCP] Conexión desde: ${socket.remoteAddress}`)
    let receivedBytes = 0
    const downloadFolder = app.getPath('downloads')
    const initialPath = join(downloadFolder, currentFileMeta.name)

    resolveCollision(initialPath, currentFileMeta.name).then((resolvedPath) => {
      if (!resolvedPath) {
        console.log('[TCP] Transferencia omitida por el usuario.')
        socket.destroy()
        mainWindow?.webContents.send('transfer-error', 'omitido')
        return
      }

      const finalFileName = basename(resolvedPath)
      const writeStream = fs.createWriteStream(resolvedPath)
      const startTime = Date.now()
      let lastTime = startTime
      let lastBytes = 0

      socket.on('data', (chunk) => {
        receivedBytes += chunk.length
        const canWrite = writeStream.write(chunk)
        if (!canWrite) { socket.pause(); writeStream.once('drain', () => socket.resume()) }

        const now = Date.now()
        if (now - lastTime > 400) {
          const timePassed = (now - startTime) / 1000
          const bytesSinceLast = receivedBytes - lastBytes
          const speedMBs = bytesSinceLast / (1024 * 1024) / ((now - lastTime) / 1000)
          const percentage = Math.min(100, Math.round((receivedBytes / (currentFileMeta.size || 1)) * 100))
          const remainingBytes = currentFileMeta.size - receivedBytes
          const avgSpeed = receivedBytes / timePassed
          const etaSeconds = avgSpeed > 0 ? Math.round(remainingBytes / avgSpeed) : 0
          mainWindow?.webContents.send('transfer-progress', { percentage, speed: speedMBs.toFixed(2), eta: etaSeconds, fileName: finalFileName })
          lastTime = now
          lastBytes = receivedBytes
        }
      })

      socket.on('end', () => writeStream.end())

      writeStream.on('finish', () => {
        console.log(`[TCP] Guardado en: ${resolvedPath}`)
        mainWindow?.webContents.send('transfer-complete', resolvedPath)
        new Notification({ title: 'LocalSend - Recibido', body: `"${finalFileName}" guardado correctamente.` }).show()
      })

      socket.on('error', (err) => {
        writeStream.end()
        const isRecoverable = err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')
        mainWindow?.webContents.send('transfer-error', isRecoverable ? `recoverable:${err.message}` : `fatal:${err.message}`)
      })
    })
  })

  tcpServer.listen(TCP_PORT, '0.0.0.0', () => console.log(`[TCP] Activo en puerto ${TCP_PORT}`))
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function initHTTPServer(): void {
  const HTTP_PORT = 53319
  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

    // PING
    if (req.url?.startsWith('/ping') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ type: 'BEACON_RESPONSE', alias: deviceAlias, deviceType: 'desktop' }))
      try {
        const clientIp = (req.socket.remoteAddress || '').replace(/^.*:/, '')
        const clientAlias = new URL(req.url, 'http://localhost').searchParams.get('alias') || 'Celular'
        mainWindow?.webContents.send('device-discovered', { alias: clientAlias, ip: clientIp, deviceType: 'mobile' })
      } catch (err) { console.error('[HTTP] Error en ping:', err) }
    }

    // PENDING
    else if (req.url === '/pending' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(pendingFile ? { fileName: pendingFile.name, fileSize: pendingFile.buffer.length } : {}))
    }

    // SEND
    else if (req.url === '/send' && req.method === 'GET') {
      if (!pendingFile) { res.writeHead(404); res.end(JSON.stringify({ error: 'No hay archivo pendiente' })); return }
      const { buffer, name } = pendingFile
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': buffer.length })
      const CHUNK = 64 * 1024
      let sent = 0
      const sendChunk = (offset: number) => {
        if (offset >= buffer.length) {
          pendingFile = null
          mainWindow?.webContents.send('transfer-progress', { percentage: 100, speed: '0', eta: 0, fileName: name })
          mainWindow?.webContents.send('transfer-complete', '')
          new Notification({ title: 'LocalSend - Envío Exitoso', body: `"${name}" descargado por el celular.` }).show()
          res.end()
          return
        }
        const slice = buffer.subarray(offset, offset + CHUNK)
        sent += slice.length
        mainWindow?.webContents.send('transfer-progress', { percentage: Math.min(99, Math.round((sent / buffer.length) * 100)), speed: '—', eta: 0, fileName: name })
        res.write(slice, () => sendChunk(offset + CHUNK))
      }
      sendChunk(0)
    }

    // META
    else if (req.url === '/meta' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || ''

      if (contentType.includes('application/json')) {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (data.files && Object.keys(data.files).length > 0) {
              const key = Object.keys(data.files)[0]
              currentFileMeta = { name: data.files[key].name || 'archivo.bin', size: data.files[key].size || 0 }
            } else {
              currentFileMeta = { name: data.name || 'archivo.bin', size: data.size || 0 }
            }
            console.log(`[HTTP] Meta: ${currentFileMeta.name} (${currentFileMeta.size} bytes)`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ACCEPTED' }))
          } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'JSON inválido' })) }
        })
      } else {
        const downloadFolder = app.getPath('downloads')
        const initialPath = join(downloadFolder, currentFileMeta.name || 'archivo_recibido.bin')

        resolveCollision(initialPath, currentFileMeta.name).then((resolvedPath) => {
          if (!resolvedPath) {
            req.resume()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'SKIPPED' }))
            mainWindow?.webContents.send('transfer-error', 'omitido')
            return
          }

          console.log(`[HTTP] Escribiendo en: ${basename(resolvedPath)}`)
          const writeStream = fs.createWriteStream(resolvedPath)
          let receivedBytes = 0
          const chunks: Buffer[] = []

          req.on('data', (chunk) => {
            receivedBytes += chunk.length
            chunks.push(chunk)
            const percentage = Math.min(100, Math.round((receivedBytes / (currentFileMeta.size || 1024 * 1024)) * 100))
            mainWindow?.webContents.send('transfer-progress', { percentage, speed: '—', eta: 0, fileName: basename(resolvedPath) })
          })

          req.on('end', () => {
            const fullBuffer = Buffer.concat(chunks)
            const sep = Buffer.from('\r\n\r\n')
            const sepIdx = fullBuffer.indexOf(sep)
            if (sepIdx !== -1 && contentType.includes('multipart')) {
              const start = sepIdx + sep.length
              const boundaryStr = contentType.split('boundary=')[1]
              let end = fullBuffer.length
              if (boundaryStr) {
                const lastIdx = fullBuffer.lastIndexOf(Buffer.from('--' + boundaryStr))
                if (lastIdx > start) end = lastIdx - 2
              }
              writeStream.write(fullBuffer.subarray(start, end))
            } else {
              writeStream.write(fullBuffer)
            }
            writeStream.end()
          })

          writeStream.on('finish', () => {
            mainWindow?.webContents.send('transfer-complete', resolvedPath)
            new Notification({ title: 'LocalSend - Recibido', body: `"${basename(resolvedPath)}" guardado en Descargas.` }).show()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'SUCCESS' }))
          })

          req.on('error', (err) => {
            writeStream.end()
            res.writeHead(500); res.end()
            const isRecoverable = err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')
            mainWindow?.webContents.send('transfer-error', isRecoverable ? `recoverable:${err.message}` : `fatal:${err.message}`)
          })
        })
      }
    } else {
      res.writeHead(404); res.end()
    }
  })

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => console.log(`[HTTP] Servidor en puerto ${HTTP_PORT}`))
}