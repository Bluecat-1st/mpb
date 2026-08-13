import type { DataStream } from "./DataStream.js";

const Vars:any = {};

class DataAssetCache{
    private static base32Alphabet:string[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split('');
    public static encodeHash(data:any):string{
        if(data.length != 32) throw new Error("Data must be exactly 32 bytes (length: " + data.length + ")");
        const out:string[] = [];
        let di = 0, oi = 0;

        for(let i=0;i<6;i++){
            const bits =
                ((data[di++] & 0xFF) << 32) |
                ((data[di++] & 0xFF) << 24) |
                ((data[di++] & 0xFF) << 16) |
                ((data[di++] & 0xFF) << 8)  |
                ((data[di++] & 0xFF));

            out[oi++] = this.base32Alphabet[(bits >>> 35) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 30) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 25) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 20) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 15) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 10) & 0x1F]!;
            out[oi++] = this.base32Alphabet[(bits >>> 5) & 0x1F]!;
            out[oi++] = this.base32Alphabet[bits & 0x1F]!;
        }

        const b0 = data[di++] & 0xFF;
        const b1 = data[di]   & 0xFF;

        out[oi++] = this.base32Alphabet[(b0 >>> 3) & 0x1F]!;
        out[oi++] = this.base32Alphabet[((b0 << 2) & 0x1C) | ((b1 >>> 6) & 0x03)]!;
        out[oi++] = this.base32Alphabet[(b1 >>> 1) & 0x1F]!;
        out[oi++] = this.base32Alphabet[(b1 << 4) & 0x1F]!;

        return out.join();
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
        this.setHash(Vars.assetCache.add(data));
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
        this.patch = stream.readString();
    }
}

export class DataAssetType{
    static create(id:number){
        switch(id){
            case 0:
                return new PatchAsset();
            
            default:{
                throw new Error(`Unknown asset type: ${id}`);
            }
        }
    }

}