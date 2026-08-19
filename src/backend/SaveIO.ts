import { DataStream } from "./DataStream.js";
import { BlockIO } from "./BlockIO.js";
import { TypeIO } from "./TypeIO.js";
import { DataAssetType } from "./DataAssetType.js";
import { say, throwError, warn } from "./textFormater.js";
import blocksTypes from "./json/BlocksTypes.json" with { type: "json" };
import type { byte, int, short } from "./primitives.js";
import type { World } from "./World.js";
import type { NetClient } from "./client.js";
import { formatValue } from "./Utills.js";

export class SaveIO {
    /** @deprecated See {@link SaveIO.writeMap}. */
    static writeMeta:any;
    /** @deprecated See {@link SaveIO.writeMap}. */
    static writeContentHeader:any;
    /** @deprecated See {@link SaveIO.writeMap}. */
    static writeWorld:any;
    /** @deprecated See {@link SaveIO.writeMap}. */
    static writeEntities:any;

    static readStringMap(buf:DataStream) {
        let map = new Map<string,string>();
        let size = buf.getShort();
        for (let i = 0; i < size; i++) {
            let key = buf.readString();
            let value = buf.readString();
            map.set(key, value);
        }
        return map;
    }
    static readMap(buf:DataStream, world:World) {
        const width = buf.getUShort();
        const height = buf.getUShort();
        world.resize(width, height);
        const l = width * height;
        for (let i = 0; i < l; i++) {
            const x = (i % width) as int;
            const y = Math.floor(i / width) as int;
            const floor = TypeIO.readBlock(buf)!;
            const ore = TypeIO.readBlock(buf)!;
            const consecutives = buf.get();
            world.create(x as int, y as int, floor, ore, 'space');
            const l = i + 1 + consecutives;
            for (let j = i + 1; j < l; j++) {
                const x = j % width, y = Math.floor(j / width);
                world.create(x as int, y as int, floor, ore, 'space');
            }
            i += consecutives
        }
        for (let i = 0; i < l; i++) {
            const x = i % width, y = Math.floor(i / width);
            const block = TypeIO.readBlock(buf);;
            const tile = world.get(x as int, y as int);
            if (!tile) throwError(`Failed to get [yellow](${x},${y})[red] tile!`)
            let isCenter = true;
            const packedCheck = buf.get();
            const hadEntity = (packedCheck & 1) != 0;
            const hadData = (packedCheck & 4) != 0;

            let data = 0 as byte;
            let floorData = 0 as byte;
            let overlayData = 0 as byte;
            let extraData = 0 as int;

            if (hadData){
                data = buf.get();
                floorData = buf.get();
                overlayData = buf.get();
                extraData = buf.getInt();
            }

            if(hadEntity){
                isCenter = buf.get() == 1;
            }
            if(isCenter){
                tile.setBlock(block!);
                // if(tile.build != null) tile.build.enabled = true;
            }
            if(hadData){
                //tile.setBlock(block);    // x
                //tile.setData(buf.get()); // x

                tile.data = data;
                //tile.floorData = floorData;
                //tile.overlayData = floorData;
                //tile.extraData = extraData;
            }
            if(hadEntity){
                if(isCenter){

                    const length = buf.getUShort();
                    const offset = buf.position();
                    try{
                        const ver = buf.get();
                        const build = BlockIO.readAll(buf, block!, (blocksTypes as Record<string,any>)[block!], ver);
                        tile.setBuild(build);
                    } catch (e) {

                    }
                    buf.position(offset + length)
                }
            } else if(!hadData) {
                const consecutives = buf.get();
                const l = i + 1 + consecutives;
                for (let j = i + 1; j < l; j++) {
                    const x = j % width, y = Math.floor(j / width);
                    tile.setBlock(block!);
                }
                i += consecutives
            }
        }
    }
    static readTeamBlocks(buf:DataStream){
        let teamc = buf.getInt();
        let plans:Record<number,{
            x:short,
            y:short,
            rot:short,
            bid:short,
            obj:ReturnType<typeof TypeIO['readObject']>
        }[]> = {}
        for(let i = 0; i < teamc; i++){
            let team = buf.getInt()
            plans[team] = []
            let blocks = buf.getInt();
            for(let j = 0; j < blocks; j++){
                let x = buf.getShort();
                let y = buf.getShort();
                let rot = buf.getShort();
                let bid = buf.getShort();
                let obj = TypeIO.readObject(buf);
                let plan = {
                    x,
                    y,
                    rot,
                    bid,
                    obj
                }
                plans[team].push(plan);
            }
        }
        return plans;
    }
    /** @deprecated See {@link SaveIO.writeMap}. */
    static writeChunk(buf:DataStream, r:(buf:DataStream, ...args:any[])=>void, args:any[], short = false){
        let start = buf.position()
        let tempbuf = DataStream.from(buf._getBuffer())
        tempbuf.position(start)
        r(tempbuf, ...args)
        let end = tempbuf.position()
        tempbuf.position(start)
        let data = tempbuf.get(end - start)
        short ? buf.putShort(data.length as short) : buf.putInt(data.length as int);
        buf.put(data);
    }
    /**
     * @deprecated I have no idea what the orginal coders were doing with this, but it does not work and may get entirly reworked, if not removed.
     */
    static writeMap(buf:DataStream, world:any, nc:NetClient){
        buf.put("MSAV");
        buf.putInt(<int>7);
        this.writeChunk(buf, this.writeMeta, [world]);
        this.writeChunk(buf, this.writeContentHeader, [global.contentMap]);
        this.writeChunk(buf, this.writeWorld, [world]);
        this.writeChunk(buf, this.writeEntities, [nc, world]);
        buf.putInt(<int>4);
        buf.skip(4);
        this.writeChunk(buf, (b) => {
            b.putInt(0 as int);
        }, []);
    }
    /**
     * This is only to align the data buffer
     */
    static readDataPatches(buf:DataStream){
        const version = buf.getInt();// Version
        console.log(`[readDataPatches] Version: ${version}`);
        if (version !== 2){
            warn(`[readDataPatches] This reader has not been setup for version [acid]${version}[]`);
        }

        const total = buf.getInt();
        say(`[readDataPatches] [acid]${total}[] assets...`);
        const assets = [];
        for (let i=0;i<total;i++){
            const typeID = buf.get();
            //say(`[readDataPatches] Patch type: [acid]${typeID}`);
            const path = buf.readString();
            //say(`[readDataPatches] Path: [yellow]${path}`);
            const embeded = buf.getBoolean();
            //say(`[readDataPatches] Embeded: ${formatValue(embeded)}`);

            say(`[readDataPatches] Patch type: [acid]${typeID}[] | Path: [yellow]${path}[] | Embeded: ${formatValue(embeded)}`);

            const asset = DataAssetType.create(typeID);
            asset.setPath(path);

            if (embeded){
                asset.read(buf);
            }else{
                const hash = buf.get(32);
                asset.setHash(hash);


            }
            assets.push(asset);
        }
        say(`[readDataPatches] Done.`)
    }
}