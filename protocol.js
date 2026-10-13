const MAX_PACKET_SIZE = 64 * 1024 * 1024
const JSON_PACKET = 1
const FRAME_PACKET = 2

function encodePacket(type, payload) {
    const body = Buffer.concat([Buffer.from([type]), payload])
    const header = Buffer.allocUnsafe(4)
    header.writeUInt32LE(body.length, 0)
    return Buffer.concat([header, body])
}

function encodeJson(message) {
    return encodePacket(JSON_PACKET, Buffer.from(JSON.stringify(message), 'utf8'))
}

function encodeFrame(requestId, width, height, bitmap) {
    const frameHeader = Buffer.allocUnsafe(13)
    frameHeader.writeUInt32LE(requestId, 0)
    frameHeader.writeUInt32LE(width, 4)
    frameHeader.writeUInt32LE(height, 8)
    frameHeader.writeUInt8(4, 12)
    return encodePacket(FRAME_PACKET, Buffer.concat([frameHeader, bitmap]))
}

class PacketDecoder {
    constructor(onPacket) {
        this.onPacket = onPacket
        this.buffer = Buffer.alloc(0)
    }

    push(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk])
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32LE(0)
            if (length < 1 || length > MAX_PACKET_SIZE) {
                throw new Error(`Invalid packet size: ${length}`)
            }
            if (this.buffer.length < length + 4) return

            const packet = this.buffer.subarray(4, length + 4)
            this.buffer = this.buffer.subarray(length + 4)
            this.onPacket(packet[0], packet.subarray(1))
        }
    }
}

module.exports = {
    JSON_PACKET,
    FRAME_PACKET,
    PacketDecoder,
    encodeJson,
    encodeFrame
}
