import type { BlockIO } from './BlockIO.js';
import type { byte, int } from './primitives.js';
import blocksParams from './json/BlocksParams.json' with {type:'json'};


export class Tiles {
    width;
    height;
    array:Tile[];
    constructor(w:number, h:number) {
        this.width = w;
        this.height = h;
        this.array = new Array(w*h);
    }
    set(x:number, y:number, tile:Tile) {
        this.array[y * this.width + x] = tile;
        this.array[y * this.width + x]!.tiles = this;
    }
    get(x:number, y:number){
        if((x >= 0 && x <= this.width) && (y >= 0 && y <= this.height)){
            return this.array[y * this.width + x] ?? null;
        } else {
            return null;
        }
    }
}

export class Tile {
    x:int;
    y:int;
    floor;
    overlay;
    block:string;
    build?:ReturnType<typeof BlockIO.readAll>;
    data?:byte;
    tiles?:Tiles;
    atConstruct = false;
    refBuild:any;
    constructor(x:int, y:int, floor:string, overlay:string, block:string) {
        this.x = x;
        this.y = y;
        this.floor = floor;
        this.overlay = overlay;
        this.block = block;
    }
    pos() {
        return (this.x << 16) | (this.y & 0xff)
    }
    setBlock(block:string){
        this.block = block;
    }
    setFloor(floor:string){
        this.floor = floor;
    }
    setOverlay(overlay:string){
        this.overlay = overlay;
    }
    setBuild(build:ReturnType<typeof BlockIO.readAll>){
        this.build = build;
        this.atConstruct = this.block.startsWith("build") || this.atConstruct;
        let midx = this.x;
        let midy = this.y;
        let size = parseInt((blocksParams as Record<string,any>)[this.block]?.size) || 1;

        let startX = Math.floor(midx - Math.floor((size - 1) / 2));
        let startY = Math.floor(midy - Math.floor((size - 1) / 2));
        let endX = startX + size;
        let endY = startY + size;

        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                let tile = this.tiles?.get(x, y);
                if(tile){
                    tile.refBuild = this;
                }
            }
        }
    }
    hasBuild(){
        return Boolean(this.build) || Boolean(this.refBuild);
    }
    setData(data:byte){
        this.data = data;
    }
    toPosString(){
        return `(${this.x},${this.y})`;
    }
}