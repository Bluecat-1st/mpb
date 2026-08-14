import type { NetClient } from "./client.js";
import type { int } from "./primitives.js";
import { DataStream } from "./DataStream.js";
import { Tiles, Tile } from "./Tiles.js";
import { SaveIO } from "./SaveIO.js";
import { Build } from "./Build.js";
import Pako from "pako";

export class World {
    tiles;
    teamBlocks?:Record<number,object[]>;
    map?:Map<string,string>;
    Build;
    constructor() {
        this.tiles = new Tiles(0, 0);
        this.Build = new Build(this);
    }
    get(x:int, y:int){
        return this.tiles.get(x, y);
    }
    create(x:int, y:int, floor:string, overlay:string, block:string) {
        this.tiles.set(x, y, new Tile(x, y, floor, overlay, block));
    }
    resize(w:number, h:number) {
        if (this.tiles.width != w || this.tiles.height != h) {
            this.tiles = new Tiles(w, h)
        }
        return this.tiles
    }
    each(callback:(x:number,y:number,tile:Tile)=>void){
        for(let x = 0; x < this.tiles.width; x++){
            for(let y = 0; y < this.tiles.height; y++){
                callback(x, y, this.get(x as int, y as int)!);
            }
        }
    }
    saveWorld(nc:NetClient){
        let buf = DataStream.allocate(2 ** 15);
        let map = SaveIO.writeMap(buf, this, nc);
        let b = buf._getBuffer().slice(0, buf.position())
        let zip = Buffer.from(Pako.deflate(b));
        return zip;
    }
}