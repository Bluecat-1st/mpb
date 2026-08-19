import type { DataStream } from "./DataStream.js";
import { say, throwError } from "./textFormater.js";
import jsCrc from 'js-crc';
const { crc32 } = jsCrc;

export class DataAssetCache{
    private static base32Alphabet:string[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split('');
    public static encodeHash(data:Buffer):string{
        if(data.length != 32) throw new Error("Data must be exactly 32 bytes (length: " + data.length + ")");
        const out:string[] = [];
        let di = 0, oi = 0;

        for(let i=0;i<6;i++){
            const bits =
                ((data[di++]! & 0xFF) << 32) |
                ((data[di++]! & 0xFF) << 24) |
                ((data[di++]! & 0xFF) << 16) |
                ((data[di++]! & 0xFF) << 8)  |
                ((data[di++]! & 0xFF));

            out[oi++] = this.base32Alphabet[(bits >>> 35) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 30) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 25) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 20) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 15) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 10) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 5) & 0x1F]!;
            out[oi++] = this.base32Alphabet[bits & 0x1F]!;
        }

        const b0 = data[di++]! & 0xFF;
        const b1 = data[di]!   & 0xFF;

        out[oi++] = this.base32Alphabet[(b0 >>> 3) & 0x1F]!;
        out[oi++] = this.base32Alphabet[((b0 << 2) & 0x1C) | ((b1 >>> 6) & 0x03)]!;
        out[oi++] = this.base32Alphabet[(b1 >>> 1) & 0x1F]!;
        out[oi++] = this.base32Alphabet[(b1 << 4) & 0x1F]!;

        return out.join();
    }
    /** 
     * @deprecated This code is a halfway port from Java to TS.
     * @return the hash
     */
    public static add(bytes:Buffer):string{
        /*
        const hash = Streams.sha256(bytes);
        const name = this.encodeHash(hash);
        const file = Vars.assetCacheDirectory.child(name);
        //avoid unnecessary disk writes when adding an asset that already exists. TODO: it's possible the file may be corrupted even if length matches?
        if(file.length() != bytes.length){
            file.writeBytes(bytes);
        }
        hashToFile.put(name, file);
        return hash;
        */
        return crc32(bytes);
    }
}

abstract class DataAsset{
    /** Set by the server to force content files to point to a specific folder */
    private overrideCacheFile:null = null;
    /** File path, including name and extension, but excluding base folder prefix. */
    public path = "";
    /** File name, excluding extension. This is taken from the path. */
    public name = "";

    /** sha256 of the internal data. this is null for non-external assets. */
    public byteHash: Buffer|null = null;
    public stringHash: string|null = null;
    public updateData(data:any):void {
        //this.setHash(DataAssetCache.add(data));
    }
    public setHash(value:Buffer):void{
        if(value.length != 32) throw new Error("hash must be 32 bytes long: " + value.length);
        this.byteHash = value;
        this.stringHash = DataAssetCache.encodeHash(value);
    }
    public setPath(path:string):void{
        this.path = path.replace('\\', '/');
        //this.name = Strings.getFileNameWithoutExtension(path);
        this.name = path.split('.').slice(0,-1).join('.');
    }
    public read(stream:DataStream):void{
        const length = stream.getInt();
        if(length == 0){
            console.error(`Empty asset in save: ${this.path}`);
            return;
        }
        const data = stream.get(length)
        this.updateData(data);
    }
}

// mindustry.mod.data.PatchAsset.java
class PatchAsset extends DataAsset{
    /** Raw string value, containing original formatting. */
    public patch = "";
    /** Parsed JSON value. Can be an empty error value if parsing failed. */
    public json:object;
    /** True if an error was encountered. */
    public error = false;
    /** Warnings encountered during patching. */
    public warnings:string[];
    constructor(patch?:string){
        super();
        this.json = {};
        this.warnings = [];

        if (patch){
            this.setPath("patch-" + "UUID.randomUUID()" + ".json");
            this.patch = patch;
        }
    }
    public read(stream: DataStream): void {
        //this.patch = stream.readString();
        this.patch = stream.get(stream.getInt()).toString('utf-8');
        say(`[PatchAsset.read] Patch:\n[white]${this.patch}\n----------`);
    }
}

// mindustry.mod.data.ContentAsset.java
class ContentAsset extends DataAsset{
    static loadableContent:string[] = [`item`,`block`,`liquid`,`status`,`unit`,`weather`];
    type?:string;
    data?:string;
    constructor();
    constructor(path:string, type:string, data:string);
    constructor(path?:string, type?:string, data?:string){
        super();
        if (path){
            this.setPath(path);
            this.type = type!;
            this.data = data!;
        }
    }
    read(stream:DataStream){
        const typeID = stream.getShort();
        const type = ContentAsset.loadableContent[typeID];
        if (!type) throwError(`Unknown content type [acid]${typeID}[]!`);
        this.data = stream.get(stream.getInt()).toString('utf-8');
        say(`[ContentAsset.read] Content:\n[white]${this.data}\n----------`);
    }
}

// mindustry.mod.data.BundleAsset.java
class BundleAsset extends DataAsset {
    cachedBundle:Record<string,string>|null;
    constructor(){
        super();
        this.cachedBundle = null;
    }
    public updateData(data: any): void {
        super.updateData(data);
        this.cachedBundle = null;
    }
}

// mindustry.mod.data.ImageAsset.java
class ImageAsset extends DataAsset {
    constructor();
    constructor(path:string,hash:Buffer);
    constructor(path?:string,hash?:Buffer){
        super();
        if (path){
            this.setPath(path);
            this.setHash(hash!);
        }
    }
}

// mindustry.mod.data.SoundAsset.java
class SoundAsset extends DataAsset {

}

// mindustry.mod.data.MusicAsset.java
class MusicAsset extends DataAsset {

}

// mindustry.mod.data.DataAssetType.java
export class DataAssetType{
    static create(id:number){
        switch(id){
            case 0:
                return new PatchAsset();
            case 1:
                return new ContentAsset();
            case 2:
                return new BundleAsset();
            case 3:
                return new ImageAsset();
            case 4:
                return new SoundAsset();
            case 5:
                return new MusicAsset();
            default:
                throwError(`Unknown asset type: [acid]${id}[]`);
        }
    }

}