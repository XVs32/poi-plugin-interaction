const React = require('react')
const InteractionServer = require('./interaction-server')

const DEFAULT_PORT = 38591
const CONFIG_KEY = 'plugin.interaction.port'
// Legacy key used by the combined "forwarder" plugin; read once as a fallback
const LEGACY_CONFIG_KEY = 'plugin.forwarder.controlPort'
const GLOBAL_KEY = '__kancolleInteractionServer'

const getPort = () => {
    if (!window.config) return DEFAULT_PORT
        const legacy = window.config.get(LEGACY_CONFIG_KEY, DEFAULT_PORT)
        return window.config.get(CONFIG_KEY, legacy)
}

const startServer = () => {
    if (window[GLOBAL_KEY]) window[GLOBAL_KEY].stop()
        const server = new InteractionServer(getPort())
        server.start()
        window[GLOBAL_KEY] = server
        return server
}

const stopServer = () => {
    if (window[GLOBAL_KEY]) {
        window[GLOBAL_KEY].stop()
        window[GLOBAL_KEY] = null
    }
}

const getServer = () => window[GLOBAL_KEY] || startServer()

startServer()

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

class InteractionPlugin extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            port: getPort(),
            status: getServer().getStatus()
        }
    }

    componentDidMount() {
        this.statusTimer = setInterval(() => {
            const server = window[GLOBAL_KEY]
            const status = server ? server.getStatus() : 'stopped'
            if (status !== this.state.status) this.setState({ status })
        }, 500)
    }

    componentWillUnmount() {
        clearInterval(this.statusTimer)
    }

    handlePortChange = event => {
        const port = parseInt(event.target.value, 10) || ''
        this.setState({ port })
        if (window.config && port) {
            window.config.set(CONFIG_KEY, port)
            getServer().restart(port)
            this.setState({ status: getServer().getStatus() })
        }
    }

    render() {
        const { port, status } = this.state
        return React.createElement(
            'div',
            { style: { padding: '15px', fontFamily: 'sans-serif' } },
            React.createElement('h3', { style: { margin: '0 0 10px 0' } }, 'KanColle Interaction'),
                                   React.createElement(
                                       'p',
                                       {
                                           style: {
                                               margin: '5px 0 15px 0',
                                               fontSize: '13px',
                                               color: status.startsWith('listening') ? '#7fd17f' : '#ffb36b'
                                           }
                                       },
                                       `● Screenshot and input service: ${status}`
                                   ),
                                   React.createElement('hr', { style: { border: 0, borderTop: '1px solid #ccc', margin: '15px 0' } }),
                                   React.createElement('label', { style: { fontWeight: 'bold', fontSize: '12px' } }, 'Interaction Port:'),
                                   React.createElement(
                                       'div',
                                       { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } },
                                       React.createElement('span', { style: { fontSize: '13px', color: '#888' } }, '127.0.0.1:'),
                                                       portInput(port, this.handlePortChange)
                                   ),
                                   React.createElement(
                                       'p',
                                       { style: { fontSize: '11px', color: '#999', margin: '8px 0 0 0' } },
                                       `Changes are applied immediately. Default: ${DEFAULT_PORT}.`
                                   )
        )
    }
}

module.exports = {
    reactClass: InteractionPlugin,
    pluginDidLoad: () => {
        const server = window[GLOBAL_KEY]
        if (!server || server.getStatus() === 'stopped') startServer()
    },
    pluginWillUnload: stopServer
}
