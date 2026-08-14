// src/backend/PacketSerializer.ts
import { decompressBlock, compressBlock, makeBuffer } from 'lz4js';
import { DataStream } from './DataStream.js';
import { FrameworkMessage } from './net.js';
import { namePacket, packets as Packets, StreamChunk } from './Packets.js';
import { say, warn, throwError } from './textFormater.js';
import type { byte, short } from './primitives.js';
import { config } from './botConfig.js';
import LZ4 from 'lz4';
import { Logger } from './logger.js';

export class PacketSerializer {
    #temp;
    constructor() {
        this.#temp = DataStream.allocate(32768);
    }
    read(buf: DataStream) {
        let id = buf.get(); // A little risky techlicly, but it should not fail unless something VERY wrong is happening.
        try {
            //console.log(`Reseived a packet with the ID of ${id}`);
            if (id == 254) {
                return this.readFramework(buf);
            } else {
                if (Packets.get(id)) {
                    let packet = new (Packets.get(id)!)();
                    //if (!packet._silent){
                    //    say(`Reseived packet [${packet._incompletPacket?'yellow':'acid'}][italic]${namePacket(id)}[reset] (ID:[acid]${id}[reset])`);
                    //}
                    let length = buf.getShort() & 0xffff;
                    let compressed = buf.get();
                    this.#temp.clear();
                    if (compressed) {
                        let size = buf.remaining();
                        decompressBlock(buf._getBuffer(buf.position()), this.#temp._getBuffer(), 0, size, 0);
                        this.#temp.position(0);
                        this.#temp.limit(length);
                        try {
                            packet.read(this.#temp/*, length*/); // Nothing uses length, there is not point.
                            if (this.#temp.hasRemaining()){
                                warn(`Did not finish reading packet [acid][italic]${namePacket(id)}[reset][yellow] by [acid]${this.#temp.remaining()}[reset][yellow] bytes.`);
                            }
                        } catch (err) {
                            say(`[red]Error reading packet [acid][italic]${namePacket(packet)}[reset][red] (ID [acid]${id}[reset][red]):`);
                            if (err instanceof Error){
                                throwError(err.stack??err.message);
                            }else{
                                throw err;
                            }
                        }
                        buf.position(buf.position() + size);
                    } else {
                        this.#temp.position(0).limit(length);
                        this.#temp.put(buf._getBuffer(buf.position()));
                        this.#temp.position(0);
                        try{
                            packet.read(this.#temp/*, length*/);
                        }catch (err){
                            say(`[red]Error reading packet [acid][italic]${namePacket(packet)}[reset][red] (ID [acid]${id}[reset][red]):`);
                            if (err instanceof Error){
                                throwError(err.stack??err.message);
                            }else{
                                throw err;
                            }
                        }
                        buf.position(buf.position() + this.#temp.position());
                    }
                    if (((!packet._silent) || config.showAllPackets) && !config.hidePacketReseives){
                        say(`Reseived packet [${packet._incompletPacket?'yellow':'acid'}][italic]${namePacket(id)}[reset] (ID:[acid]${id}[reset]${packet._incompletPacket?`, [yellow]Incomplete Packet[reset]`:''}${packet._lastUpdatedFor===null||packet._lastUpdatedFor<config.version?`, [yellow]this packet may need updating (Current version:[acid]${packet._lastUpdatedFor??'Unknown Version'}[reset][yellow])[reset]`:''})`);
                    }else if (packet._lastUpdatedFor===null||packet._lastUpdatedFor<config.version){
                        warn(`Packet [acid][italic]${namePacket(packet)}[reset][yellow] (ID:[acid]${packet._id}[reset][yellow]) may need updating. (Current version:[acid]${packet._lastUpdatedFor??'Unknown Version'}[reset][yellow])`);
                    }
                    return packet;
                }else{
                    warn(`Unknown packet ID [acid]${id}`);
                }
                buf.clear();
                return null;
            }
        }catch(err){
            say(`[red]Error reading packet...`);
    
            // Save the raw unparsed packet bytes for analysis
            const rawBytes = this.#temp._getBuffer().subarray(0, this.#temp.limit());
            Logger.saveFailedPacket(id, rawBytes, err);

            if (err instanceof Error) {
                throwError(err.stack ?? err.message);
            } else {
                throw err;
            }
        }
    }
    readFramework(buf: DataStream) {
        let id = buf.get();
        say(`readFramework packet: [acid]${id}`);
        if (id == 0) {
            throwError('Unknown ID');
        } else if (id == 1) {
            return new FrameworkMessage.discoverHost();
        } else if (id == 2) {
            return new FrameworkMessage.KeepAlive();
        } else if (id == 3) {
            let p = new FrameworkMessage.RegisterUDP();
            p.connectionID = buf.getInt();
            return p;
        } else if (id == 4) {
            let p = new FrameworkMessage.RegisterTCP();
            p.connectionID = buf.getInt();
            return p;
        } else {
            throwError(`Unknown FrameworkMessage [acid]${id}[reset][red][bold]!`);
        }
    }
    write(buf:DataStream, object:Buffer|DataStream|FrameworkMessage|(typeof Packets.Packet)) {
        if (Buffer.isBuffer(object) || (object instanceof DataStream)){
            buf.put(object as DataStream);// Should keep typescript happy.
        } else if (object instanceof FrameworkMessage) {
            buf.put(-2 as byte);
            this.writeFramework(buf, object);
        } else if (object instanceof Packets.Packet) {
            if ((!object._silent || config.showAllPackets) && !config.hidePacketSends){
                say(`Sending packet [acid][italic]${namePacket(object)}[reset] (ID:[acid]${object._id}[reset]).${object._lastUpdatedFor===null||object._lastUpdatedFor<config.version?` [yellow]This packet may need updating. (Current version:[acid]${object._lastUpdatedFor??'Unknown Version'}[reset][yellow])[reset]`:''}`);
            }else if (object._lastUpdatedFor===null||object._lastUpdatedFor<config.version){
                warn(`Packet [acid][italic]${namePacket(object)}[reset][yellow] (ID:[acid]${object._id}[reset][yellow]) may need updating. (Current version:[acid]${object._lastUpdatedFor??'Unknown Version'}[reset][yellow])`);
            }
            buf.put(object._id as byte);
            this.#temp.clear();
            object.write(this.#temp);
            let length = this.#temp.position();
            buf.putShort(length as short);
            this.#temp.flip();
            if (length < 36 || object instanceof StreamChunk || config.dontCompress) {
                buf.put(0 as byte);
                buf.put(this.#temp);
            } else {
                //buf.put(1 as byte);
                //let size = compressBlock(this.#temp._getBuffer(), buf._getBuffer(buf.position()), this.#temp.position(), this.#temp.limit(), makeBuffer(1 << 16));
                //buf.position(buf.position() + size);
                buf.put(1 as byte);

                const rawBuffer = Buffer.from(this.#temp._getBuffer().buffer, 0, length);

                // Create a temporary destination buffer for the raw LZ4 block
                const compressedBlock = Buffer.alloc(LZ4.encodeBound(length));
                const compressedSize = LZ4.encodeBlock(rawBuffer, compressedBlock);

                // Write the compressed bytes into your main packet stream
                buf.put(compressedBlock.subarray(0, compressedSize));
            }
        } else {
            console.error("Invaild type:" + object.toString());
        }
    }
    writeFramework(buf:DataStream, msg:FrameworkMessage) {
        if (msg instanceof FrameworkMessage.KeepAlive) {
            buf.put(2 as byte)
        } else if (msg instanceof FrameworkMessage.RegisterUDP) {
            buf.put(3 as byte);
            buf.putInt(msg.connectionID!);
        } else if (msg instanceof FrameworkMessage.RegisterTCP) {
            buf.put(4 as byte);
            buf.putInt(msg.connectionID!);
        }
    }
}
