import type { byte, int, nullableShort, nullableString } from "./primitives.js";
import type { TypeIO } from "./TypeIO.js";
import type { World } from "./World.js";

export class Build {
    world;
    constructor(world:World){
        this.world = world;
    }
    beginPlace(unit:[byte, int],block:nullableString,team:byte,x:int,y:int,rotation:int,object:null|ReturnType<typeof TypeIO.readObject>){
        const tile = this.world.get(x,y);
        
    }
}