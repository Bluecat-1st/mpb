import { config } from "./botConfig.js";
import { boolByte, type byte, type double, type float, type int, type long, type short, type uint, type ushort } from "./primitives.js";
import { say, throwError } from "./textFormater.js";
// For TS/JSDoc
import type { TypeIO } from "./TypeIO.js";

export class DataStream {
    #pos = 0;
    #buf;
    #lim;
    constructor(length:number){
        this.#buf = Buffer.alloc(length);
        this.#lim = length;
    }
    /** Create a new DataSteam object from a buffer */
    static from(buffer:Buffer){
        let obj = new this(buffer.length);
        obj.put(buffer);
        obj.position(0);
        return obj;
    }
    /** Create a new DataStream object */
    static allocate(length:number) {
        return new this(length);
    }
    /** Move the read pointer back to the beganning and set the buffer limit back to the buffer's length */
    clear() {
        this.#pos = 0;
        this.#lim = this.#buf.length;
        return this
    }
    /** Get the length of the buffer */
    capacity() {
        return this.#buf.length
    }
    /** Set the limit of the buffer */
    limit(limit:number):DataStream;
    /** Get the limit of the buffer */
    limit():number;
    limit(limit?:number):DataStream|number {
        if (limit !== undefined) {
            this.#lim = limit;
            this.#pos = Math.min(this.#pos, limit);
            return this
        } else {
            return this.#lim
        }
    }
    /** Get the bytes left to read in the buffer */
    remaining() {
        if (this.#pos > this.#lim){
            console.error(`It looks like DataSteam has read past it\'s data limit! (By ${this.#pos-this.#lim} bytes)`);
        }
        return this.#lim - this.#pos;
    }
    /** Set the position of the read pointer */
    position(pos:number):DataStream;
    /** Get the position of the read pointer */
    position():number;
    position(pos?:number):DataStream|number{
        if (pos !== undefined){
            this.#pos = pos;
            return this;
        } else {
            return this.#pos;
        }
    }
    /** The the buffer limit to the read pointer's position and reset the pointer */
    flip() {
        this.#lim = this.#pos;
        this.#pos = 0;
        return this
    }
    _getBuffer(offset?:number):Buffer {
        return this.#buf.slice(offset??0, this.#lim);
    }
    put(data:Buffer):number;
    put(data:string):number;
    put(data:number[]):number;
    put(data:DataStream):DataStream;
    put(data:byte):DataStream;
    put(data:Buffer|string|number[]|DataStream|number):number|DataStream{
        if (Buffer.isBuffer(data)) {
            let writeBytes = Math.min(this.remaining(), data.length);
            data.copy(this.#buf, this.#pos, 0, writeBytes);
            this.#pos += writeBytes;
            return writeBytes
        } else if (typeof (data) == "string") {
            return this.put(Buffer.from(data))
        } else if (data instanceof Array) {
            return this.put(Buffer.from(data))
        } else if (data instanceof DataStream) {
            data.position(data.position() + this.put(data._getBuffer(data.position())))
            return this
        } else {
            this.#buf[this.#pos] = data;
            this.#pos++;
            return this
        }
    }
    get(bytes:Buffer,offset:number,length:number):void;
    get(bytes:number):Buffer;
    get():byte;
    get(bytes?:Buffer|number, offset?:number, length?:number):void|Buffer|number {
        if (Buffer.isBuffer(bytes)) {
            this.#buf.copy(bytes, offset, this.#pos, this.#pos + length!);
            this.#pos += length!
            if (this.#pos > this.#lim){
                throw new RangeError(`DataStream has read past it\'s data size. (By ${this.#pos-this.#lim} bytes)`);
            }
        } else {
            const o = this.#pos;
            const len = (typeof bytes == 'number' ? bytes : 1);
            if (len < 0) throwError(`Invalid read length [acid]${len}[red]!`);
            this.#pos = o + len;
            if (this.#pos > this.#lim){
                throw new RangeError(`DataStream has read past it\'s data size. (By ${this.remaining()} bytes)`);
            }
            return bytes ? this.#buf.slice(o, bytes + o) : this.#buf.slice(o, o + 1)[0]
        }
    }
    getInt() {
        return this.get(4).readInt32BE() as int;
    }
    getUShort() {
        return this.get(2).readUInt16BE() as ushort;
    }
    getShort() {
        return this.get(2).readInt16BE() as short;
    }
    getLong() {
        let o = this.#pos ?? 0;
        this.#pos = o + 8;
        if (this.#pos > this.#lim){
            throw new RangeError(`DataStream has read past it\'s data size. (By ${this.#pos-this.#lim} bytes)`);
        }
        let value = this.#buf.readInt32BE(o) << 32;
        return (value | this.#buf.readInt32BE(o + 4)) as long;
    }
    getFloat() {
        let o = this.#pos ?? 0;
        this.#pos = o + 4;
        if (this.#pos > this.#lim){
            throw new RangeError(`DataStream has read past it\'s data size. (By ${this.#pos-this.#lim} bytes)`);
        }
        return this.#buf.readFloatBE(o) as float;
    }
    getDouble() {
        let o = this.#pos ?? 0;
        this.#pos = o + 8;
        if (this.#pos > this.#lim){
            throw new RangeError(`DataStream has read past it\'s data size. (By ${this.#pos-this.#lim} bytes)`);
        }
        return this.#buf.readDoubleBE(o) as double;
    }
    /** Reads a string without a null check (If the string can be null, use {@link TypeIO.readString}) */
    readString(debug = false) {
        //let length = this.getShort();
        let length = this.getUShort();
        if (debug) say(`[DataStream.readString] String length: [acid]${length}`);
        return this.get(length).toString();
    }
    putInt(data:int) {
        this.#buf.writeInt32BE(data, this.#pos);
        this.#pos += 4;
        return this;
    }
    putUInt(data:uint){
        this.#buf.writeUInt8(data, this.#pos);
        this.#pos += 1;
        return this;
    }
    getUInt():uint{
        let o = this.#pos ?? 0;
        this.#pos = o + 1;
        if (this.#pos > this.#lim){
            throw new RangeError(`DataStream has read past it\'s data size. (By ${this.#pos-this.#lim} bytes)`);
        }
        return this.#buf.readUint8(o) as uint;
    }
    putShort(data:short) {
        this.#buf.writeInt16BE(data, this.#pos);
        this.#pos += 2;
        return this;
    }
    putUShort(data:ushort) {
        this.#buf.writeUInt16BE(data, this.#pos);
        this.#pos += 2;
        return this;
    }
    putLong(data:long) {
        this.#buf.writeInt32BE((data & 0xffffffff00000000) >> 32, this.#pos);
        this.#buf.writeInt32BE(data >> 32, this.#pos + 4);
        this.#pos += 8;
        return this;
    }
    putFloat(data:float) {
        this.#buf.writeFloatBE(data, this.#pos);
        this.#pos += 4;
        return this;
    }
    putDouble(data:double) {
        this.#buf.writeDoubleBE(data, this.#pos);
        this.#pos += 8;
        return this;
    }
    hasRemaining() {
        return this.remaining() != 0;
    }
    skip(amount:number) {
        this.#pos += amount;
    }
    putBoolean(bool:boolean){
        this.put(boolByte(bool));
    }
    getBoolean(): boolean{
        const b = this.get();
        if (b === 1){
            return true;
        }else if (b === 0){
            return false;
        }else{
            throwError(`[reset][acid]${b}[reset][red][bold] is not a boolean!`);
        }
    }
    // Debug
    printStatus(info:string|null = null){
        if (!config.dataStreamStatusPrint) return;
        say(`DataStream:[acid][bold]${this.#pos}[reset]/[red][bold]${this.#lim}[reset]|${this.#buf.length}${info?` | ${info}`:''}`);
    }
}