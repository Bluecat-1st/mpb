import type { DataStream } from "./DataStream.js";
import type { Tile } from "./Tiles.js";
import type { World } from "./World.js";
import { boolByte, byteFalse, byteTrue, float, type byte, type double, type int, type long, type nullableShort, short, type ushort, type nullableString, type nullableByte } from "./primitives.js";
import { Point2 } from "./Math.js";
import { BlockIO } from "./BlockIO.js";
import { UnitIO } from "./UnitIO.js";
import { say, throwError, warn } from "./textFormater.js";
import { AdminAction } from "./Packets.js";
import { formatValue, Utils } from "./Utills.js";
import blocksTypes from './json/BlocksTypes.json' with {type:'json'};
import type { Mindustry } from "./client.js";

/** `[<MObject>TypeID, value]` */
type readObjectReturn = 
    [0, null]|
    [1, int]|
    [2, long]|
    [3, float]|
    [4, nullableString]|
    [5, [byte, short]]|
    [6, int[]]|
    [7, [int, int]]|
    //[8, int[]]|
    [8, Point2[]]|
    [9, [byte, short]]|
    [10, boolean]|
    [11, double]|
    [12, int]|
    [13, short]|
    [14, byte[]]|
    [15, byte]|
    [16, byte[]]|
    [17, int]|
    [18, [float, float][]]|
    [19, [float, float]]|
    [20, byte]|
    [22, readObjectReturn]|
    [23, byte]|
    [undefined, undefined]
/**
 * @todo Update enum names after seperating {@link TypeIO.readObject}'s types (Ex: boolean and bytes).
 */
export enum MObject {
    null, int, long, float, nullableString, byteShortPair, intArray, intPair, Point2Array,
    byteShortPair2, boolean, double, int2, short, byteArray, byte, byteArray2, int3,
    floatPairArray, floatPair, byte2, MObject, byte3, undefined
}

export interface Plan {
    breakPlan: boolean,
    position: Point2,
    block?: string,
    rotation?: byte,
    hasConfig?: boolean,
    config?: readObjectReturn
}

export class TypeIO {
    static world?:World;
    static game?: Mindustry;
    /** Sets up some variables required for some operations to work */
    static setup(mindustry:Mindustry){
        TypeIO.world = mindustry.world;
        TypeIO.game = mindustry;
    }
    // Custom
    static readInts(buf:DataStream){
        let len = buf.getShort();
        let ints:int[] = [];
        for (let i=0;i<len;i++){
            ints.push(buf.getInt());
        }
        return ints;
    }
    /**
     * @deprecated Use {@link TypeIO.writeBlock} instead to have content mapping.
     */
    static writeBlockRaw(buf:DataStream,blockID:nullableShort){
        buf.putShort(blockID??-1 as short);
    }
    /**
     * @deprecated Use {@link TypeIO.readBlock} instead to have content mapping.
     */
    static readBlockRaw(buf:DataStream):nullableShort{
        const ID = buf.getShort();
        return ID === -1 ? null:ID;
    }
    static writeBlock(buf:DataStream,block:short|string|null){
        if (typeof block === 'string'){
            block = Utils.getContentID('block',block);
        }else if (block === null){
            block = <short>-1;
        }
        buf.putShort(block!);
    }
    static readBlock(buf:DataStream):nullableString{
        let id = buf.getShort() as nullableShort;
        if (id === -1){
            id = null;
        }
        return this.game?.utils.getContentByID('block',id) ?? null;
    }
    static writeItem(buf:DataStream, item:short|string|null){
        if (typeof item === 'string'){
            item = Utils.getContentID('item',item);
        }else if (item === null){
            item = <short>-1;
        }
        buf.putShort(item!);
    }
    static readItem(buf:DataStream){
        let id = buf.getShort() as nullableShort;
        if (id === -1){
            id = null;
        }
        return Utils.getContentByID('item',id);
    }
    static readIntSeq(buf:DataStream){
        const size = buf.getInt();
        const seq:int[] = [];
        for (let i=0;i<size;i++){
            seq.push(buf.getInt());
        }
        return seq;
    }
    static writeIntSeq(buf:DataStream,seq:int[]){
        buf.putInt(seq.length as int);
        for (const int of seq){
            buf.putInt(int);
        }
    }
    static readTile(buf:DataStream) {
        const pos = Point2.unpack(buf.getInt());
        return this.world!.get(pos.x,pos.y);
    }
    static readTileReliable(buf:DataStream){
        return Point2.unpack(buf.getInt());
    }
    /** A placeholder */
    static writeEffect(buf:DataStream,effectID:ushort){
        buf.putUShort(effectID);
    }
    /** A placeholder */
    static readEffect(buf:DataStream){
        return buf.getUShort();
    }
    /** A placeholder */
    static readTeam(buf:DataStream){
        return buf.get();
    }
    /** A placeholder */
    static writeTeam(buf:DataStream,team:byte){
        buf.put(team);
    }
    static writeItemStacks(buf:DataStream, itemStacks:[short,int][]){
        buf.putShort(itemStacks.length as short);
        for (const stack of itemStacks){
            TypeIO.writeItems(buf,stack);
        }
    }
    static readItemStacks(buf:DataStream){
        const len = buf.getShort();
        const stacks:[short,int][] = [];
        for (let i=0;i<len;i++){
            stacks.push(
                TypeIO.readItems(buf)
            );
        }
        return stacks;
    }
    static writeAction(buf:DataStream,action:AdminAction){
        buf.put(action as byte);
    }
    static readAction(buf:DataStream):AdminAction|null{
        const i = buf.get();
        if (!(i in AdminAction)){
            warn(`Unknown admins action: ${formatValue(i)}`);
            return null;
        }else{
            return i;
        }
    }
    /** A placeholder */
    static writeBulletTypeRaw(buf:DataStream, type:short){
        buf.putShort(type);
    }
    /** A placeholder */
    static readBulletTypeRaw(buf:DataStream):short{
        return buf.getShort();
    }
    static writeWeather(buf:DataStream, weather:string){
        const contentID = Utils.getContentID('weather', weather);
        buf.putShort(contentID === null ? short(-1) : contentID);
    }
    static readWeather(buf:DataStream):nullableString{
        const id = buf.getShort();
        return Utils.getContentByID('weather',id === -1 ? null : id);
    }
    /** A placeholder */
    static writeUnitTypeRaw(buf:DataStream,unitType:short){
        buf.putShort(unitType);
    }
    /** A placeholder */
    static readUnitTypeRaw(buf:DataStream){
        return buf.getShort();
    }
    static readUnitContainer(buf:DataStream){
        if (!this.game?.netClient?.units) return;
        const unit = this.readUnit(buf);

        const entity = UnitIO.read(buf,unit[0]);
        this.game.netClient.units[unit[1]] = entity;
    }
    static writeShorts(buf:DataStream, shorts:short[]){
        buf.putShort(<short>shorts.length);
        for (let short of shorts){
            buf.putShort(short);
        }
    }
    static readShorts(buf:DataStream){
        const len = buf.getShort();
        const out = new Array<short>(len);
        for (let i=0;i<len;i++){
            out[i] = buf.getShort();
        }
        return out;
    }
    // Ported
    static writeString(buf:DataStream, string:nullableString) {
        if (string) {
            buf.putBoolean(true);
            let strbuf = Buffer.from(string);
            //buf.put(strbuf.length >> 8 as byte);
            //buf.put((strbuf.length & 0xff) as byte);
            buf.putShort(<short>strbuf.length);
            buf.put(strbuf);
        } else {
            buf.putBoolean(false);
        }
    }
    /** 
     * Reads a **nullable** string
     *
     * There is a difference because the null byte can make a huge difference...
     */
    static readString(buf:DataStream):nullableString {
        let str = buf.getBoolean();
        if (str) {
            return buf.readString();
        } else {
            return null;
        }
    }
    static readPlans(buf:DataStream){
        let used = buf.getShort();
        let plans = [];
        for(let i = 0; i < used; i++){
            let plan = this.readPlan(buf);
            plans.push(plan);
        }
        return plans;
    }
    static readPlan(buf:DataStream){
        let type = buf.getBoolean();
        let position = this.readTile(buf);

        if (!position) return null;

        if(type){
            return {
                breakPlan: type,
                position
            } as Plan;
        } else {
            let block = this.readBlock(buf);
            let rotation = buf.get();
            let hasConfig = buf.getBoolean();
            let config = this.readObject(buf);
            return {
                breakPlan: type,
                position,
                block,
                rotation,
                hasConfig,
                config
            } as Plan;
        }
    }
    /**
     * @todo Seperate `booleans` from `bytes`. (And really seperate all of the merged objects)
     */
    static readObject(buf:DataStream,printType = false):readObjectReturn{
        let type = buf.get();
        if (printType){
            say(`Object type: ${type}`);
        }

        if (type === 0) {
            return [0, null];
        } else if (type === 1) {
            return [1, buf.getInt()];
        } else if (type === 2) {
            return [2, buf.getLong()];
        } else if (type === 3) {
            return [3, buf.getFloat()];
        } else if (type === 4) {
            return [4, this.readString(buf)];
            //return [4, buf.readString()]
        } else if (type === 5) {
            return [5, [buf.get(), buf.getShort()]];
        } else if (type === 6 || type === 21) {
            let len = buf.getShort();
            let seq:int[] = [];
            for (let i = 0; i < len; i++) {
                seq.push(buf.getInt());
            }
            return [type as 6, seq];
        } else if (type === 7) {
            return [7, [buf.getInt(), buf.getInt()]];
        } else if (type === 8) {
            /*
            let len = buf.getShort();
            let out = [];
            for (let i = 0; i < len; i++) {
                out.push(buf.getInt());
            }
            return [8, out];*/
            const len = buf.getUInt();
            const out = [];
            for (let i=0;i<len;i++){
                out.push(Point2.unpack(buf.getInt()));
            }
            return [8, out];
        } else if (type === 9) {
            return [9, [buf.get(), buf.getShort()]];
        } else if (type === 10) {
            return [10, buf.getBoolean()];
        } else if (type === 11) {
            return [11, buf.getDouble()];
        } else if (type === 12 || type === 17) {
            return [type, buf.getInt()] as [12, int] | [17, int];
        } else if (type === 13) {
            return [type as 13, buf.getShort()];
        } else if (type === 14 || type === 16) {
            //let blen = buf.getShort();
            let blen = buf.getInt();
            let seq:byte[] = [];
            for (let i = 0; i < blen; i++) {
                seq.push(buf.get());
            }
            return [type, seq] as [14, byte[]] | [16, byte[]];
        } else if (type === 15) {
            return [15, buf.get()];
        } else if (type === 18) {
            let len = buf.getShort();
            let out:[float, float][] = [];
            for (let i = 0; i < len; i++) {
                out.push([buf.getFloat(), buf.getFloat()] as [float, float]);
            }
            return [18, out as [float, float][]];
        } else if (type === 19) {
            return [19, [buf.getFloat(), buf.getFloat()]];
        } else if (type === 20) {
            return [20, buf.get()]; // Switch to UInt?
        } else if (type === 21){
            throwError(`TODO: readObject type 21`);
        } else if (type === 22) {
            let len = buf.getInt();
            let out = [];
            for (let i = 0; i < len; i++) {
                out.push(this.readObject(buf));
            }
            return [type as 22, out as readObjectReturn];
        } else if (type === 23) {
            return [type as 23, buf.get()];
        } else {
            //warn(`Unknown object type [acid]${type}[yellow].`);
            throwError(`Unknown object type [acid]${type}[red]!`);
            return [undefined, undefined];
        }
    }
    static readPayload(buf:DataStream){
        let ex = buf.get();
        if(!ex){
            return null;
        }
        let type = buf.get();
        if(type == 1){
            let id = buf.getShort();
            let ver = buf.get();

            let block = BlockIO.readAll(buf, global.contentMap['block']![id]!, (blocksTypes as Record<string,any>)[global.contentMap['block']![id]!], ver);
            return [id, block] as [short, ReturnType<typeof BlockIO.readAll>];
        } else {
            let typeid = buf.get();
            let unit = UnitIO.read(buf, typeid, true);

            return unit;
        }
    }
    static readVecNullable(buf:DataStream) {
        let x = buf.getFloat();
        let y = buf.getFloat();
        return (isNaN(x) || isNaN(y)) ? null : {x, y};
    }
    static readCommand(buf:DataStream):nullableByte{
        let val = buf.get();
        return val == 255 ? null:val;
    }
    static writeCommand(buf:DataStream, command:nullableByte){
        buf.put(command == null ? <byte>255:command);
    }
    static writeTile(buf:DataStream, tile:Tile) {
        buf.putInt(Point2.pack(tile.x,tile.y));
    }
    static writePlansQueueNet(buf:DataStream, plans:Plan[]) {
        buf.putInt(plans.length as int);
        for(let i = 0; i < plans.length; i++){
            this.writePlan(buf, plans[i]!);
        }
    }
    static writePlans(buf:DataStream, plans:Plan[]){
        buf.putShort(plans.length as short);
        for(let i = 0; i < plans.length; i++){
            this.writePlan(buf, plans[i]!)
        }
    }
    static writePlan(buf:DataStream, plan:Plan){
        buf.putBoolean(plan.breakPlan);
        buf.putInt(Point2.pack(plan.position.x,plan.position.y))
        if(!plan.breakPlan){
            //buf.putShort(plan.block!);
            this.writeBlock(buf, plan.block!);
            buf.put(plan.rotation!);
            buf.putBoolean(plan.hasConfig!);
            this.writeObject(buf, plan.config!);
        }
    }
    static writeObject(buf:DataStream, obj:readObjectReturn) {
        let type = obj[0] as byte;
        buf.put(type);

        if (type == 0) {
            
        } else if (type == 1) {
            buf.putInt(obj[1] as int);
        } else if (type == 2) {
            buf.putLong(obj[1] as long); 
        } else if (type == 3) {
            buf.putFloat(obj[1] as float);
        } else if (type == 4) {
            this.writeString(buf, obj[1] as string);
        } else if (type == 5) {
            buf.put((obj[1] as any)[0]);
            buf.putShort((obj[1] as any)[1]);
        } else if (type == 6 || type == 21) {
            buf.putShort((obj[1] as any).length);
            for (let i = 0; i < (obj[1] as any).length; i++) {
                buf.putInt((obj[1] as any)[i]);
            }
        } else if (type == 7) {
            buf.putInt((obj[1] as any)[0]);
            buf.putInt((obj[1] as any)[1]);
        } else if (type == 8) {
            buf.putShort((obj[1] as any).length);
            for (let i = 0; i < (obj[1] as any).length; i++) {
                buf.putInt((obj[1] as any)[i]);
            }
        } else if (type == 9) {
            buf.put((obj[1] as any)[0]);
            buf.putShort((obj[1] as any)[1]);
        } else if (type == 10) {
            buf.put((obj[1] as any));
        } else if (type == 11) {
            buf.putDouble((obj[1] as any));
        } else if (type == 12 || type == 17) {
            buf.putInt((obj[1] as any));
        } else if (type == 13) {
            buf.putShort((obj[1] as any));
        } else if (type == 14 || type == 16) {
            buf.putShort((obj[1] as any));
            for (let i = 0; i < (obj[1] as any).length; i++) {
                buf.put((obj[1] as any)[i]);
            }
        } else if (type == 15) {
            buf.put((obj[1] as any));
        } else if (type == 18) {
            buf.putShort((obj[1] as any).length);
            for (let i = 0; i < (obj[1] as any).length; i++) {
                buf.putFloat((obj[1] as any)[i][0]);
                buf.putFloat((obj[1] as any)[i][1]);
            }
        } else if (type == 19) {
            buf.putFloat((obj[1] as any)[0]);
            buf.putFloat((obj[1] as any)[1]);
        } else if (type == 20) {
            buf.put((obj[1] as any));
        } else if (type == 22) {
            buf.putShort((obj[1] as any).length);
            for (let i = 0; i < (obj[1] as any).length; i++) {
                this.writeObject(buf, (obj[1] as any)[i]);
            }
        } else if (type == 23) {
            buf.put((obj[1] as any));
        }
    }
    static readPlansQueue(buf:DataStream){
        let used = buf.getInt();
        let plans = [];
        for(let i = 0; i < used; i++){
            let plan = this.readPlan(buf)!;
            plans.push(plan);
        }
        return plans;
    }
    static writeInts(buf:DataStream, ints:int[]){
        buf.putShort(ints.length as short)
        for(let i = 0; i < ints.length; i++){
            buf.putInt(ints[i]!)
        }
    }
    static writeBuilding(buf:DataStream, build:{x:short,y:short}){
        if(build.x == -1 || build.y == -1){
            buf.putInt(-1 as int);
            return
        }
        buf.putShort(build.x);
        buf.putShort(build.y);
    }
    static writeVec2(buf:DataStream, vec:{x:float,y:float}){
        buf.putFloat(vec.x);
        buf.putFloat(vec.y);
    }
    static readEntity(buf:DataStream){
        return buf.getInt()
    }
    static readBuilding(buf:DataStream){
        let x = buf.getShort();
        let y = buf.getShort();
        return {x, y};
        //return buf.getInt();
    }
    /**
     * @returns `[type, id]`
     */
    static readUnit(buf:DataStream){
        let type = buf.get();
        let id = buf.getInt();
        return [type, id] as [byte, int];
    }
    /**
     * @param unit `[type, id]`
     */
    static writeUnit(buf:DataStream, unit:[byte, int]){
        buf.put(unit[0]);
        buf.putInt(unit[1]);
    }
    static readVec2(buf:DataStream) {
        let x = buf.getFloat();
        let y = buf.getFloat();
        return {x, y}
    }
    static writeItems(buf:DataStream, items:[short, int]) {
        let id = items[0];
        let count = items[1];
        
        buf.putShort(id);
        buf.putInt(count);
    }
    /**
     * @param item `itemID`
     * @deprecated Use {@link TypeIO.writeItem} instead.
     */
    static writeItemRaw(buf:DataStream, item:short){
        buf.putShort(item);
    }
    /**
     * @returns `itemID`
     * @deprecated Use {@link TypeIO.readItem} instead for the mapped content.
     */
    static readItemRaw(buf:DataStream):nullableShort{
        let id = buf.getShort();
        return id == -1 ? null : id;
    }
    static writeEntity(buf:DataStream, id:int){
        buf.putInt(id);
    }
    static readBytes(buf:DataStream) {
        let length = buf.getShort();
        let data = buf.get(length);
        return data;
    }
    static writeBytes(buf:DataStream, data:Buffer) {
        buf.putShort(data.length as short);
        buf.put(data);
    }
    static readStance(buf:DataStream):nullableByte {
        let val = buf.get();
        return val == 255 ? null : val;
    }
    static writeStance(buf:DataStream, val:nullableByte) {
        buf.put(val ?? <byte>255);
    }
    static readAbilities(buf:DataStream) {
        let len = buf.get()
        let abils = []
        for(let i = 0; i < len; i++){
            let data = buf.getFloat();
            abils[i] = data
        }
        return abils
    }
    static writeAbilities(buf:DataStream, abils:float[]) {
        buf.put(abils.length as byte);
        for (let i = 0; i < abils.length; i++) {
            buf.putFloat(abils[i]!);
        }
    }
    static readController(buf: DataStream) {
        let type = buf.get();
        
        if (type == 0) {
            let id = buf.getInt();
            return [0, id] as [0, int];
        } else if (type == 1) {
            buf.skip(4);
            return [1] as [1];
        } else if (type == 3) {
            let pos = buf.getInt();
            return [3, pos] as [3, int];
        } else if (type == 4 || type == 6 || type == 7 || type == 8 || type == 9) {
            let hasAttack = buf.getBoolean();
            let hasPos = buf.getBoolean();
            let pos;
            
            if (hasPos) {
                pos = this.readVec2(buf);
            }
            
            let attack;
            let entityType;
            if (hasAttack) {
                entityType = buf.get();
                attack = buf.getInt();
            }
            
            let id;
            if (type == 6 || type == 7 || type == 8 || type == 9) {
                id = buf.get();
            }
            
            let attackinfo: {
                build?:int,
                unit?:int,
                vec?:{x:float,y:float}
            } = {};
            //let ctype: Record<number, any> = {};
            let ctype: byte[] = [];
            
            // Command queue is parsed in types 7, 8, and 9
            if (type == 7 || type == 8 || type == 9) {
                // Must use unsigned byte representation (0-255 loop limit)
                let length = buf.get();// & 0xFF; 
                for (let i = 0; i < length; i++) {
                    let ctype2 = buf.get();
                    ctype[i] = ctype2;
                    if (ctype2 == 0) {
                        attackinfo.build = buf.getInt();
                    } else if (ctype2 == 1) {
                        attackinfo.unit = buf.getInt();
                    } else if (ctype2 == 2) {
                        attackinfo.vec = this.readVec2(buf);
                    }
                }
            }
            
            let stances: nullableByte[] = [];
            if (type == 8) {
                stances.push(this.readStance(buf));
            } else if (type == 9) {
                let numStances = buf.get();// & 0xFF; // read.ub()
                for (let i = 0; i < numStances; i++) {
                    stances.push(this.readStance(buf));
                }
            }
            
            let result = {
                entityType,
                ctype,
                hasAttack,
                hasPos,
                pos,
                attackinfo,
                attack,
                id,
                stances
            };

            return [type, result] as [4|6|7|8|9,typeof result];
        } else if (type == 5) {
            return [5] as [5]; // AssemblerAI (No properties written)
        } else {
            // Fallback matching the Java else block (e.g. Type 2 / Default GroundAI)
            return [type] as [byte];
        }
    }
    static writeController(buf:DataStream, controller:[byte, any]) {
        let type = controller[0];
        buf.put(type);

        if (type == 0) {
            let id = controller[1];
            buf.putInt(id);
        } else if (type == 1) {
            buf.skip(4);
        } else if (type == 3) {
            let pos = controller[1];
            buf.putInt(pos);
        } else if (type == 4 || type == 6 || type == 7 || type == 8) {
            let result = controller[1];
            buf.put(result.hasAttack);
            buf.put(result.hasPos);

            if (result.hasPos) {
                this.writeVec2(buf, result.pos);
            }

            if (result.hasAttack) {
                buf.put(result.entityType);
                buf.putInt(result.attack);
            }

            if (type == 6 || type == 7 || type == 8) {
                buf.put(result.id);
            }

            if (type == 7 || type == 8) {
                buf.put(result.ctype.length);
                for (let i = 0; i < result.ctype.length; i++) {
                    buf.put(result.ctype[i]);
                    let ctype = result.ctype[i];
                    if (ctype == 0) {
                        buf.putInt(result.attackinfo.build);
                    } else if (ctype == 1) {
                        buf.putInt(result.attackinfo.unit);
                    } else if (ctype == 2) {
                        this.writeVec2(buf, result.attackinfo.vec);
                    }
                }
            }

            if (type == 8) {
                this.writeStance(buf, result.stance);
            }
        }
    }
    static readMounts(buf:DataStream){
        let len = buf.get();
        let mounts = []
        for(let i = 0; i < len; i++){
            let state = buf.get();
            let ax = buf.getFloat();
            let ay = buf.getFloat();

            mounts[i] = [state, ax, ay]
        }
        return mounts
    }
    static writeMounts(buf:DataStream, mounts:[byte,float,float][]) {
        buf.put(mounts.length as byte);

        for (let i = 0; i < mounts.length; i++) {
            let mount = mounts[i]!;
            buf.put(mount[0]);
            buf.putFloat(mount[1]);
            buf.putFloat(mount[2]);
        }
    }
    /**
     * @returns `[id, count]`
     */
    static readItems(buf:DataStream){
        let id = buf.getShort();
        let count = buf.getInt();
        return [id, count] as [short, int];
    }
    /**
     * @returns `[id, time]`
     */
    static readStatus(buf:DataStream) {
        let id = buf.getShort();
        let time = buf.getFloat();
        return [id, time] as [short, float];
    }
    /**
     * @param status `[id, time]`
     */
    static writeStatus(buf:DataStream, status:[short,float]) {
        let id = status[0];
        let time = status[1];
        
        buf.putShort(id);
        buf.putFloat(time);
    }
    static writePayload(buf:DataStream, payload:any) {
        if (payload === null) {
            buf.put(byteFalse);
            return;
        }

        buf.put(byteTrue);
        let type = boolByte(Array.isArray(payload));
        buf.put(type);

        if (type === 1) {
            let id = payload[0];
            let block = payload[1];
            let ver = block[0].ver;

            buf.putShort(id);
            buf.put(ver);
            BlockIO.writeAll(buf, block, Utils.getContentByID('block',id)!, ver);
        } else {
            UnitIO.write(buf, payload, true);
        }
    }
    static writeVecNullable(buf:DataStream, vec:{x:float,y:float}){
        buf.putFloat(vec.x);
        buf.putFloat(vec.y);
    }
}