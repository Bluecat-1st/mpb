// src/backend/net.ts
import type { PacketSerializer } from "./PacketSerializer.js";
import type { int, short } from "./primitives.js";
import { throwError } from "./textFormater.js";
import { DataStream } from "./DataStream.js";
import { Logger } from "./logger.js";
import dgram from "dgram";
import net from "net";

export class FrameworkMessage {
    static discoverHost = class extends FrameworkMessage { };
    static RegisterTCP = class extends FrameworkMessage {
        connectionID: int | undefined;
    };
    static RegisterUDP = class extends FrameworkMessage {
        connectionID: int | undefined;
    };
    static KeepAlive = class extends FrameworkMessage { };
}
export class TCPConnection {
    #readBuffer;
    #writeBuffer;
    #serializer;
    #tcp;
    #connected;
    #timer?: NodeJS.Timeout;
    #objectLength;
    /**
     * 
     * @param writeBufLen - The write buffer length.
     * @param serializer - The packet serializer
     * @param packetHandler 
     * @param sock - The net socket to use.
     */
    constructor(writeBufLen: number, serializer: PacketSerializer, packetHandler:(res?:ReturnType<TCPConnection['readObject']>,port?:number,ip?:string) => void, sock?: net.Socket) {
        this.#writeBuffer = DataStream.allocate(writeBufLen);
        this.#readBuffer = Buffer.alloc(0);
        this.#objectLength = 0;
        this.#serializer = serializer;
        if (!sock) {
            this.#tcp = new net.Socket();
            this.#tcp.setNoDelay(true);
            this.#connected = false;
        } else {
            this.#tcp = sock;
        }

        this.#tcp.on("connect", () => {
            this.#timer = setInterval(() => {
                this.send(new FrameworkMessage.KeepAlive());
            }, 8000);
        });
        this.#tcp.on("data", d => {
            let res = this.readObject(d as Buffer);
            packetHandler(res, this.#tcp.remotePort, this.#tcp.remoteAddress);
            while (res) {
                res = this.readObject();
                packetHandler(res, this.#tcp.remotePort, this.#tcp.remoteAddress);
            }
        });
        this.#tcp.on("close", () => {
            clearInterval(this.#timer);
        });
    }
    on(name: string, func: (...args: any[]) => void) {
        this.#tcp.on(name, func);
    }
    send(object: Parameters<PacketSerializer['write']>[1]) {
        this.#writeBuffer.clear();
        this.#writeBuffer.position(2);
        this.#serializer.write(this.#writeBuffer, object);
        let length = this.#writeBuffer.position() - 2;
        this.#writeBuffer.position(0);
        this.#writeBuffer.putShort(length as short);
        this.#writeBuffer.position(length + 2);
        this.#writeBuffer.flip();
        this.#tcp.write(this.#writeBuffer._getBuffer());
        return length + 2;
    }
    connect(port:number, ip:string) {
        if (!this.#connected) {
            this.#readBuffer = Buffer.alloc(0);
            this.#objectLength = 0;
            this.#tcp.setTimeout(12000);
            this.#tcp.connect(port, ip);
            this.#tcp.ref();
            this.#connected = true
        } else {
            console.error("TCP already connected!")
        }
    }
    close() {
        if (this.#connected) {
            this.#connected = false;
            this.#tcp.end();
            this.#tcp.unref();
        }
    }
    readObject(d?:Buffer) {
        try {
            if (d) {
                this.#readBuffer = Buffer.concat([this.#readBuffer, d])
            }
            let readBuffer = this.#readBuffer;
            if (this.#objectLength == 0) {
                if (readBuffer.length < 2) {
                    return null
                }
                //this.#objectLength = readBuffer.readInt16BE()
                this.#objectLength = readBuffer.readUInt16BE()
            }
            let length = this.#objectLength;
            if (length <= 0) {
                throwError("Invalid object length: " + length);
            }
            if (readBuffer.length < length) {
                return null;
            }
            let buf = DataStream.from(readBuffer).position(2);
            buf.limit(length + 2);
            let object = this.#serializer.read(buf);
            if (buf.position() - 2 != length) {
                this.#objectLength = 0;
                this.#readBuffer = Buffer.alloc(0);
                return null
            }
            this.#objectLength = 0;
            this.#readBuffer = readBuffer.slice(buf.position());
            return object
        } catch (e) {
            if (e instanceof Error){
                console.error(e.stack);
            }else{
                console.error(e);
            }
            this.#objectLength = 0;
            this.#readBuffer = Buffer.alloc(0);
            return null
        }
    }
}

export class UDPConnection {
    #writeBuffer;
    #serializer;
    #udp;
    /** If the UDP connection is connected. */
    #connected;
    #timer: NodeJS.Timeout | undefined;
    port;
    ip;
    /**
     * 
     * @param writeBufLen - The write buffer length.
     * @param serializer - The packet serializer.
     * @param packetHandler - The packet handler.
     * @param sock - The socket to use.
     * @param port - The port to use.
     * @param ip  - The IP to use.
     * @param msg2 - IDK
     */
    constructor(writeBufLen: number, serializer: PacketSerializer, packetHandler: (data: ReturnType<UDPConnection['readObject']>) => void, sock?: dgram.Socket, port?: number, ip?: string, msg2?: any) {
        this.#writeBuffer = DataStream.allocate(writeBufLen);
        this.#serializer = serializer;
        this.#connected = false;
        if (!sock) {
            this.#udp = dgram.createSocket("udp4", d => {
                const obj = this.readObject(d);
                try {
                    packetHandler(obj);
                }catch(e){
                    if (!obj) throw e;
                    if (obj instanceof FrameworkMessage) throw e;
                    Logger.saveFailedPacket(obj._id,d,e);
                    throw e;
                }
            });
        } else {
            this.#udp = sock;
            this.#udp.on('message', (msg, rinfo) => {
                //packetHandler(this.readObject(msg));
                const obj = this.readObject(msg);
                try {
                    packetHandler(obj);
                }catch(e){
                    if (!obj) throw e;
                    if (obj instanceof FrameworkMessage) throw e;
                    Logger.saveFailedPacket(obj._id,msg,e);
                    throw e;
                }
            });
            this.port = port;
            this.ip = ip;
            packetHandler(this.readObject(msg2));
        }
    }
    readObject(d: Buffer) {
        let buf = DataStream.from(d);
        let obj = this.#serializer.read(buf);
        if (buf.hasRemaining()) {
            return null;
        }
        return obj;
    }
    connect(port: number, ip: string) {
        if (!this.#connected) {
            this.#writeBuffer.clear();
            this.#udp.connect(port, ip);
            this.#udp.ref();
            this.#connected = true;
            this.#timer = setInterval(() => {
                this.send(new FrameworkMessage.KeepAlive());
            }, 19000);
        } else {
            console.error("UDP already connected!");
        }
    }
    close() {
        if (this.#connected) {
            this.#connected = false;
            this.#udp.disconnect();
            this.#udp.unref && this.#udp.unref();
            clearInterval(this.#timer);
        }
    }
    send(object: Parameters<PacketSerializer['write']>[1]) {
        this.#writeBuffer.clear();
        this.#serializer.write(this.#writeBuffer, object);
        this.#writeBuffer.flip();
        let length = this.#writeBuffer.limit();
        if (this.port && this.ip) {
            this.#udp.send(this.#writeBuffer._getBuffer(), 0, this.#writeBuffer._getBuffer().length, this.port, this.ip, (e) => {
                e && console.error("Err while sending udp: ", e);
            });
        } else {
            this.#udp.send(this.#writeBuffer._getBuffer());
        }
        return length;
    }
}

