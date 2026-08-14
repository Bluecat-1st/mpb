import type { int } from "./primitives.js";

export class Point2 {
    x:int;
    y:int;
    constructor(x: int, y: int) {
        this.x = x;
        this.y = y;
    }
    public static unpack(pos: number): Point2 {
        const x = (pos >>> 16) as int;
        const y = (pos & 0xFFFF) as int;
        return new Point2(x, y);
    }
    public static pack(x: int, y: int): int {
        const shortX = (x << 16) >> 16;
        const shortY = y & 0xFFFF;
        
        return ((shortX << 16) | shortY) as int;
    }
    public static toString(point:Point2|{x:number,y:number}):string {
        return `(${point.x},${point.y})`;
    }
    public toString(){
        return Point2.toString(this);
    }
}