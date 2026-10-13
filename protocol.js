const net = require('net')
const {
    JSON_PACKET,
    PacketDecoder,
    encodeJson,
    encodeFrame
} = require('./protocol')

const GAME_WIDTH = 1200

class InteractionServer {
    constructor(port = 38591) {
        this.port = port
        this.server = null
        this.client = null
        this.status = 'stopped'
    }

    start() {
        if (this.server) return this.server
            const server = net.createServer(socket => this._accept(socket))
            this.server = server
            this.status = `starting on 127.0.0.1:${this.port}`
            server.on('error', error => {
                console.error(`[API Forwarder] interaction server error: ${error.message}`)
                if (this.server === server) {
                    this.status = `error: ${error.code || error.message}`
                }
            })
            server.listen(this.port, '127.0.0.1', () => {
                const port = server.address().port
                if (this.server === server) {
                    this.status = `listening on 127.0.0.1:${port}`
                }
                console.log(`[API Forwarder] interaction service listening on 127.0.0.1:${port}`)
            })
            return server
    }

    stop() {
        if (this.client) {
            this.client.destroy()
            this.client = null
        }
        if (this.server) {
            const server = this.server
            this.server = null
            if (server.listening) server.close()
        }
        this.status = 'stopped'
    }

    restart(port) {
        this.stop()
        this.port = port
        this.start()
    }

    getStatus() {
        return this.status
    }

    _accept(socket) {
        if (this.client) this.client.destroy()
            this.client = socket
            socket.setNoDelay(true)

            const decoder = new PacketDecoder((type, payload) => {
                if (type !== JSON_PACKET) throw new Error('Commands must use JSON packets')
                    const command = JSON.parse(payload.toString('utf8'))
                    this._handleCommand(socket, command).catch(error => {
                        this._sendError(socket, command.id, error)
                    })
            })

            socket.on('data', chunk => {
                try {
                    decoder.push(chunk)
                } catch (error) {
                    this._sendError(socket, 0, error)
                    socket.destroy()
                }
            })
            socket.on('close', () => {
                if (this.client === socket) this.client = null
            })
            socket.on('error', () => { })
    }

    async _handleCommand(socket, command) {
        const id = Number(command.id)
        if (!Number.isInteger(id) || id < 1) throw new Error('Invalid request id')

            switch (command.type) {
                case 'hello':
                    this._sendJson(socket, {
                        id,
                        type: 'hello',
                        protocol: 1,
                        capabilities: [
                            'capture', 'click', 'hover', 'scroll', 'drag', 'refresh', 'quest_stats'
                        ]
                    })
                    break
                case 'ping':
                    this._sendJson(socket, { id, type: 'pong' })
                    break
                case 'capture':
                    await this._capture(socket, id)
                    break
                case 'click':
                    this._click(command.x, command.y)
                    this._sendJson(socket, { id, type: 'ok' })
                    break
                case 'hover':
                    this._hover(command.x, command.y)
                    this._sendJson(socket, { id, type: 'ok' })
                    break
                case 'scroll':
                    this._scroll(command.x, command.y, command.deltaY)
                    this._sendJson(socket, { id, type: 'ok' })
                    break
                case 'drag':
                    await this._drag(command.startX, command.startY, command.endX, command.endY)
                    this._sendJson(socket, { id, type: 'ok' })
                    break
                case 'refresh':
                    this._getWebContents().reload()
                    this._sendJson(socket, { id, type: 'ok' })
                    break
                case 'quest_stats':
                    this._sendJson(socket, {
                        id,
                        type: 'quest_stats',
                        data: this._getQuestStats()
                    })
                    break
                default:
                    throw new Error(`Unknown command: ${command.type}`)
            }
    }

    async _capture(socket, requestId) {
        const viewRef = this._getViewRef()
        const dimensions = window.getStore('layout.webview')
        const isolate = window.config.get('poi.layout.isolate', false)
        const width = isolate ? dimensions.windowWidth : dimensions.width
        const height = isolate ? dimensions.windowHeight : dimensions.height
        const ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
        const rect = {
            x: 0,
            y: 0,
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        }

        let image = await viewRef.capturePage(rect)
        if (!image || image.isEmpty()) {
            image = await this._getWebContents().capturePage(rect)
        }
        socket.write(encodeFrame(requestId, image.getSize().width, image.getSize().height, image.getBitmap()))
    }

    _click(x, y) {
        const point = this._scalePoint(x, y)
        const webContents = this._getWebContents()
        webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
        webContents.sendInputEvent({
            type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1
        })
        webContents.sendInputEvent({
            type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1
        })
    }

    _hover(x, y) {
        const point = this._scalePoint(x, y)
        this._getWebContents().sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
    }

    _scroll(x, y, deltaY) {
        if (!Number.isFinite(Number(deltaY)) || Number(deltaY) === 0) {
            throw new Error('Invalid scroll delta')
        }
        const point = this._scalePoint(x, y)
        this._getWebContents().sendInputEvent({
            type: 'mouseWheel',
            x: point.x,
            y: point.y,
            deltaX: 0,
            deltaY: Number(deltaY)
        })
    }

    async _drag(startX, startY, endX, endY) {
        const start = this._scalePoint(startX, startY)
        const end = this._scalePoint(endX, endY)
        const webContents = this._getWebContents()
        webContents.sendInputEvent({ type: 'mouseMove', x: start.x, y: start.y })
        webContents.sendInputEvent({
            type: 'mouseDown', x: start.x, y: start.y, button: 'left', clickCount: 1
        })

        const steps = 10
        for (let step = 1; step <= steps; step += 1) {
            const x = Math.round(start.x + ((end.x - start.x) * step / steps))
            const y = Math.round(start.y + ((end.y - start.y) * step / steps))
            webContents.sendInputEvent({ type: 'mouseMove', x, y, button: 'left' })
            await new Promise(resolve => setTimeout(resolve, 35))
        }
        webContents.sendInputEvent({
            type: 'mouseUp', x: end.x, y: end.y, button: 'left', clickCount: 1
        })
    }

    _scalePoint(x, y) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            throw new Error('Invalid game coordinates')
        }
        const dimensions = window.getStore('layout.webview')
        const isolate = window.config.get('poi.layout.isolate', false)
        const width = isolate ? dimensions.windowWidth : dimensions.width
        const zoom = window.getStore('config.poi.appearance.zoom', 1) || 1
        const scale = Math.floor(width * zoom) / GAME_WIDTH
        return { x: Math.round(Number(x) * scale), y: Math.round(Number(y) * scale) }
    }

    _getViewRef() {
        const viewRef = window.getStore('layout.webview.ref')
        if (!viewRef) throw new Error('The KanColle webview is not ready')
            return viewRef
    }

    _getWebContents() {
        const webContents = this._getViewRef().getWebContents()
        if (!webContents) throw new Error('The KanColle web contents are not ready')
            return webContents
    }

    _getQuestStats() {
        const store = window.getStore()
        return (store && store.info && store.info.quests) || {}
    }

    _sendJson(socket, message) {
        socket.write(encodeJson(message))
    }

    _sendError(socket, requestId, error) {
        if (!socket.destroyed) {
            this._sendJson(socket, {
                id: Number(requestId) || 0,
                           type: 'error',
                           message: error.message || String(error)
            })
        }
    }
}

module.exports = InteractionServer
