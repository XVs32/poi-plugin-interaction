const React = require('react')
const InteractionServer = require('./interaction-server')

const getTargetUrl = () => {
    const port = window.config ? window.config.get('plugin.forwarder.port', 9223) : 9223
    return `http://localhost:${port}/webhook/kancolle`
}

const getControlPort = () => {
    return window.config ? window.config.get('plugin.forwarder.controlPort', 38591) : 38591
}

if (!window.hasKancolleResponseListener) {
    window.addEventListener('game.response', event => {
        const { path, body, postBody } = event.detail
        if (!path || !path.startsWith('/kcsapi/')) return

        fetch(getTargetUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path,
                request: postBody,
                response: body,
                stage: 'response_received',
                timestamp: Date.now()
            })
        }).catch(() => { })
    })
    window.hasKancolleResponseListener = true
}

const registerMapInterceptor = () => {
    try {
        const { remote } = require('electron')
        const session = remote.getCurrentWindow().webContents.session
        const filter = { urls: ['*://*/kcs2/resources/map/*'] }

        session.webRequest.onBeforeRequest(filter, null)
        session.webRequest.onBeforeRequest(filter, (details, callback) => {
            fetch(getTargetUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: details.url,
                    stage: 'going_to_send',
                    timestamp: Date.now()
                })
            }).catch(() => { })
            callback({ cancel: false })
        })
    } catch (error) {
        console.warn(`[API Forwarder] map interceptor is unavailable: ${error.message}`)
    }
}

const startInteractionServer = () => {
    if (window.__apiForwarderInteractionServer) {
        window.__apiForwarderInteractionServer.stop()
    }
    const server = new InteractionServer(getControlPort())
    server.start()
    window.__apiForwarderInteractionServer = server
}

registerMapInterceptor()
startInteractionServer()

const portInput = (value, onChange) => React.createElement('input', {
    type: 'number',
    value,
    onChange,
    min: 1024,
    max: 65535,
    style: {
        width: '90px',
        padding: '5px',
        fontSize: '13px',
        borderRadius: '4px',
        border: '1px solid #555',
        backgroundColor: '#222',
        color: '#fff'
    }
})

module.exports = {
    reactClass: class ForwarderPlugin extends React.Component {
        constructor(props) {
            super(props)
            this.state = {
                port: window.config ? window.config.get('plugin.forwarder.port', 9223) : 9223,
                controlPort: getControlPort(),
                interactionStatus: window.__apiForwarderInteractionServer.getStatus()
            }
        }

        componentDidMount() {
            this.statusTimer = setInterval(() => {
                const server = window.__apiForwarderInteractionServer
                if (!server) return
                const interactionStatus = server.getStatus()
                if (interactionStatus !== this.state.interactionStatus) {
                    this.setState({ interactionStatus })
                }
            }, 500)
        }

        componentWillUnmount() {
            clearInterval(this.statusTimer)
        }

        handlePortChange = event => {
            const port = parseInt(event.target.value, 10) || ''
            this.setState({ port })
            if (window.config && port) {
                window.config.set('plugin.forwarder.port', port)
                registerMapInterceptor()
            }
        }

        handleControlPortChange = event => {
            const controlPort = parseInt(event.target.value, 10) || ''
            this.setState({ controlPort })
            if (window.config && controlPort) {
                window.config.set('plugin.forwarder.controlPort', controlPort)
                window.__apiForwarderInteractionServer.restart(controlPort)
                this.setState({ interactionStatus: window.__apiForwarderInteractionServer.getStatus() })
            }
        }

        render() {
            return React.createElement(
                'div',
                { style: { padding: '15px', fontFamily: 'sans-serif' } },
                React.createElement('h3', { style: { margin: '0 0 10px 0' } }, 'KanColle API Forwarder'),
                React.createElement('p', { style: { margin: '5px 0', fontSize: '13px' } }, '● KCSAPI forwarding active'),
                React.createElement('p', { style: { margin: '5px 0', fontSize: '13px' } }, '● Map resource tracking active'),
                React.createElement(
                    'p',
                    {
                        style: {
                            margin: '5px 0 15px 0',
                            fontSize: '13px',
                            color: this.state.interactionStatus.startsWith('listening') ? '#7fd17f' : '#ffb36b'
                        }
                    },
                    `● Screenshot and input service: ${this.state.interactionStatus}`
                ),
                React.createElement('hr', { style: { border: 0, borderTop: '1px solid #ccc', margin: '15px 0' } }),
                React.createElement(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    React.createElement('label', { style: { fontWeight: 'bold', fontSize: '12px' } }, 'Target Webhook Port:'),
                    React.createElement(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                        React.createElement('span', { style: { fontSize: '13px', color: '#888' } }, 'http://localhost:'),
                        portInput(this.state.port, this.handlePortChange),
                        React.createElement('span', { style: { fontSize: '13px', color: '#888' } }, '/webhook/kancolle')
                    ),
                    React.createElement('label', { style: { fontWeight: 'bold', fontSize: '12px', marginTop: '8px' } }, 'Interaction Port:'),
                    React.createElement(
                        'div',
                        { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                        React.createElement('span', { style: { fontSize: '13px', color: '#888' } }, '127.0.0.1:'),
                        portInput(this.state.controlPort, this.handleControlPortChange)
                    ),
                    React.createElement(
                        'p',
                        { style: { fontSize: '11px', color: '#999', margin: '5px 0 0 0' } },
                        'Changes are applied immediately. Defaults: webhook 9223, interaction 38591.'
                    )
                )
            )
        }
    }
}
