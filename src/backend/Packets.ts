import type { PacketSerializer } from "./PacketSerializer.js"
import type { NetClient } from "./client.js";
import type { Point2 } from "./Math.js";
import type { Tile } from "./Tiles.js";
import { DataStream } from "./DataStream.js";
import { TypeIO, type Plan, type Vec } from "./TypeIO.js";
import { say, warn, throwError, formatText } from './textFormater.js';
import { byte, float, int, short, type long, type ushort, type nullableInt, type nullableString, type nullableByte } from "./primitives.js";
import { config } from "./botConfig.js";
import { formatValue } from "./Utills.js";
import jsCrc from 'js-crc';
const { crc32 } = jsCrc;

say(`Loading packets...`);

export type BuildPos = {x:short,y:short};
export type NetUnit = [byte, int];

export enum KickReason {
    kick, clientOutdated, serverOutdated, banned, gameover, recentKick,
    nameInUse, idInUse, nameEmpty, customClient, serverClose, vote, typeMismatch,
    whitelist, playerLimit, serverRestarting
}

export enum AdminAction {
    kick, ban, trace, wave, switchTeam
}

export class StreamBuilder {
    /** The stream ID */
    id;
    /** The packet the stream will become */
    type;
    /** The total length of the stream */
    total;
    /** The data stream */
    stream?:Buffer;
    /** The current length of the reseaved data */
    length;
    /** The reseaved data */
    #buf:Buffer[];
    constructor(packet:StreamBegin) {
        this.length = 0;
        this.id = packet.id;
        this.type = packet.type!;
        this.total = packet.total!;
        this.#buf = [];
    }
    add(data:Buffer) {
        if (!(data instanceof Buffer)) throw new TypeError(formatText(`[red][bold]Data must be a buffer!`));
        this.length += data.length;
        this.#buf.push(data);
    }
    isDone() {
        return this.length >= this.total;
    }
    build() {
        const p = Packets.get(this.type);
        if (!p){
            throwError(`[StreamBuilder.build] Packet [acid]${this.type}[] does not exist!`);
        }
        let s = new p();
        s._stream = this.stream = Buffer.concat(this.#buf);
        return s;
    }
}

const Packets = new Map<number, new () => Packet>();
/** Template base for packets */
export class Packet {
    /** The ID the packet maps to. */
    _id = -1;
    /** Whether to hide the packet send/receive messages for this packet */
    _silent = false;
    /** If the packet reading code needed to be finished */
    _incompletPacket = false;
    /** The version the packet was last updated for. `null` if it is not known */
    _lastUpdatedFor:number|null = null;
    _stream?:Buffer;
    read(buf:DataStream):void{
        buf.skip(buf.remaining());
        this._incompletPacket = true;
        this._lastUpdatedFor = config.version;
    }
    write(buf:DataStream):void{}
    /**
     * @deprecated There is no reason to use this because this system use {@link Packet.read} to parse packets, not {@link Packet.handled} like Mindustry does.
     */
    handled(_:any):void{}
    /**
     * @deprecated There is no point of implimenting this because this bot will **not** be hosting a server, only joining one.
     */
    handleServer(_:any):void{}
    /** The action to run after a succesfull read, this is called automaticly in {@link PacketSerializer.read}, so don't call this anywhere else otherwise you risk very broken behaver. */
    handleClient(nc:NetClient):void{}
}

/** Adds a Packet class to the registery */
function registerPacket(packet:new () => Packet){
    const id = (new packet())._id;
    if (id === (new Packet())._id){
        throwError(`Packet [acid][italic]${namePacket(packet)}[][] does not have it's ID defined!`)
    }else if (Packets.get(id)){
        throwError(`Can't register two packets of the same ID. (Old packet: [acid]${namePacket(id)}[] New packet: [acid]${namePacket(packet)}[])`);
    }
    Packets.set(id,packet);
}

/** Gets the name of the packet that the packet ID maps to. */
export function namePacket(packetID:number):string;
/** Gets the name of a packet contructor. */
export function namePacket(packet:(new () => Packet)):string;
/** Gets the name of a packet instance. */
export function namePacket(packet:Packet):string;
export function namePacket(packet:undefined):`Unknown Packet`;
export function namePacket(packet:number|(new () => Packet)|Packet|undefined):string{
    if (typeof packet === 'number'){
        const p = Packets.get(packet);
        return namePacket(p!); // Force TypeScript to let this through as both states are valid.
    }else if (packet instanceof Packet){
        return namePacket(packet._id);
    }else{
        if (!packet || !packet.name) return 'Unknown Packet';
        return packet.name;
    }
}

class StreamBegin extends Packet {
    _id = 0;
    _silent = true;
    _lastUpdatedFor = 159;
    static #lastid = <int>0;
    /** The stream ID */
    id:int;
    /** The total length of the stream */
    total?:int;
    /** The ID of the finished packet */
    type?:byte;
    constructor() {
        super();
        this.id = StreamBegin.#lastid;
        StreamBegin.#lastid++;
    }
    write(buf:DataStream) {
        buf.putInt(this.id);
        buf.putInt(this.total!);
        buf.put(this.type!);
    }
    read(buf:DataStream) {
        this.id = buf.getInt();
        this.total = buf.getInt();
        this.type = buf.get();
    }
}
registerPacket(StreamBegin);

export class StreamChunk extends Packet {
    _id = 1;
    _silent = true;
    _lastUpdatedFor = 159;
    /** The stream ID */
    id?:int;
    /** The chunk's data */
    data?:Buffer;
    write(buf:DataStream) {
        buf.putInt(this.id!);
        buf.putShort(<short>this.data!.length);
        buf.put(this.data!);
    }
    read(buf:DataStream) {
        this.id = buf.getInt();
        this.data = buf.get(buf.getShort());
    }
}
registerPacket(StreamChunk);

class WorldStream extends Packet {
    _id = 2;
    _lastUpdatedFor = 159;
    read(){}
    handleClient(nc:NetClient){
        nc.connectConfirm();
        nc.loadWorld(this);
    }
}
registerPacket(WorldStream);

class ConnectPacket extends Packet {
    _id = 3;
    _lastUpdatedFor = 159;
    /** The bot's name */
    name?:string;
    usid?:string;
    uuid?:string;
    lang?:string;
    /** The type of client */
    client?:string;
    /** The mod this client has */
    mods?:string[];
    write(buf:DataStream) {
        buf.putInt(int(config.version));
        TypeIO.writeString(buf, this.client!);
        TypeIO.writeString(buf, this.name!);
        TypeIO.writeString(buf, this.lang!);
        TypeIO.writeString(buf, this.usid!);
        let uuidbuf = Buffer.from(this.uuid!, "base64");
        buf.put(uuidbuf);
        buf.putLong(crc32(uuidbuf) as unknown as long);
        buf.putBoolean(false);// Mobile
        buf.put([0xff, 0xa1, 0x08, 0xff]); // Name color
        buf.put(this.mods!.length as byte);
        for(let i = 0; i < this.mods!.length; i++){
            TypeIO.writeString(buf,this.mods![i]!);
        }
    }
    
    /*write(buf: DataStream) {
        buf.putInt(int(config.version));
        TypeIO.writeString(buf, this.client!);
        TypeIO.writeString(buf, this.name!);
        TypeIO.writeString(buf, this.lang!);
        TypeIO.writeString(buf, this.usid!);

        // 1. Write 16-byte decoded Base64 UUID
        let uuidbuf = Buffer.from(this.uuid!, "base64");
        
        // Ensure UUID buffer is exactly 16 bytes
        if (uuidbuf.length !== 16) {
            const padded = Buffer.alloc(16);
            uuidbuf.copy(padded);
            uuidbuf = padded;
        }
        buf.put(uuidbuf);

        // 2. Write 8-byte CRC32 Long (Java write() sends it, but read() ignores it)
        // Ensure your crc32 function returns a BigInt/Long writer or 8-byte write
        //const crcValue = BigInt(crc32(uuidbuf));
        const crcValue = crc32(uuidbuf);
        buf.putLong(crcValue as unknown as long);

        // 3. Mobile flag (1 byte)
        buf.put(byteFalse);

        // 4. Color integer (4 bytes)
        buf.putInt(0xffa108 as int);

        // 5. Mods array count (1 byte)
        const modCount = this.mods ? this.mods.length : 0;
        buf.put(modCount as byte);

        // 6. Mod names
        for (let i = 0; i < modCount; i++) {
            TypeIO.writeString(buf, this.mods![i]!);
        }
    }*/
    read(buf:DataStream) {
        buf.getInt();
        this.client = TypeIO.readString(buf)!;
        this.name = TypeIO.readString(buf)!;
        this.lang = TypeIO.readString(buf)!;
        this.usid = TypeIO.readString(buf)!;
        let uuidbuf = buf.get(16)
        this.uuid = uuidbuf.toString("base64");
        //const crc32Value = buf.getLong();
        const crc32Value = buf.getLong().toString();

        const calculatedCrc32 = crc32(uuidbuf);
        if (crc32Value !== calculatedCrc32) {
            throwError(`CRC32 mismatch. (${crc32Value} !== ${calculatedCrc32})`);
        }
        buf.get()
        buf.get(4);
        let mods = []
        let mc = buf.get()
        for(let i = 0; i < mc; i++){
            mods.push(TypeIO.readString(buf)!);
        }
        this.mods = mods
    }
}
registerPacket(ConnectPacket);

class AssetRequirementStream extends Packet {
    _id = 4;
    _lastUpdatedFor = 159;
    read(){}
    handleClient(nc: NetClient): void {
        nc.loadRequiredAssets(this);
    }
}
registerPacket(AssetRequirementStream);

class AssetStream extends Packet {
    _id = 5;
    _lastUpdatedFor = 159;
    read(){};
    handleClient(nc: NetClient): void {
        nc.game.call.requestWorld();
    }
}
registerPacket(AssetStream);

class AdminRequestCallPacket extends Packet {
    _id = 6;
    _lastUpdatedFor = 159;
    other?:int;
    /** Don't write `null`, it is only for if the action is unknown */
    action?:AdminAction|null;
    params?:ReturnType<typeof TypeIO.readObject>;
    write(buf: DataStream): void {
        TypeIO.writeEntity(buf,this.other!);
        TypeIO.writeAction(buf,this.action!);
        TypeIO.writeObject(buf,this.params!);
    }
    read(buf: DataStream): void {
        this.other = TypeIO.readEntity(buf);
        this.action = TypeIO.readAction(buf);
        this.params = TypeIO.readObject(buf);
    }
}
registerPacket(AdminRequestCallPacket);

class AnnounceCallPacket extends Packet {
    _id = 7;
    _lastUpdatedFor = 159;
    message?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
    }
    handleClient(): void {
        say(`[AnnounceCallPacket]: [white]${this.message}`);
    }
}
registerPacket(AnnounceCallPacket);

class AssemblerDroneSpawnedCallPacket extends Packet {
    _id = 8;
    _lastUpdatedFor = 159;
    tile?:Tile;
    id?:int;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
        buf.putInt(this.id!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.id = buf.getInt();
    }
}
registerPacket(AssemblerDroneSpawnedCallPacket);

class AssemblerUnitSpawnedCallPacket extends Packet {
    _id = 9;
    _lastUpdatedFor = 159;
    tile?:Tile;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
    }
}
registerPacket(AssemblerUnitSpawnedCallPacket);

class AutoDoorToggleCallPacket extends Packet {
    _id = 10;
    _lastUpdatedFor = 159;
    tile?:Tile;
    open?:boolean;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
        buf.putBoolean(this.open!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.open = buf.getBoolean();
    }
}
registerPacket(AutoDoorToggleCallPacket);

class BeginBreakCallPacket extends Packet {
    _id = 11;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.contruction;
    unit?:NetUnit;
    team?:any;
    x?:int;
    y?:int;
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.team = TypeIO.readTeam(buf);
        this.x = buf.getInt();
        this.y = buf.getInt();
    }
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeTeam(buf,this.team!);
        buf.putInt(this.x!);
        buf.putInt(this.y!);
    }
}
registerPacket(BeginBreakCallPacket);

class BeginPlaceCallPacket extends Packet {
    _id = 12;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.contruction;
    unit?:NetUnit;
    result?:nullableString;
    team?:byte;
    x?:int;
    y?:int;
    rotation?:int;
    placeConfig?:ReturnType<typeof TypeIO.readObject>;
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.result = TypeIO.readBlock(buf);
        this.team = TypeIO.readTeam(buf);
        this.x = buf.getInt();
        this.y = buf.getInt();
        this.rotation = buf.getInt();
        this.placeConfig = TypeIO.readObject(buf);
    }
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeBlock(buf,this.result!);
        TypeIO.writeTeam(buf,this.team!);
        buf.putInt(this.x!);
        buf.putInt(this.y!);
        buf.putInt(this.rotation!);
        TypeIO.writeObject(buf,this.placeConfig!);
    }
    handleClient(nc: NetClient): void {
        nc.game.world.Build.beginPlace(this.unit!,this.result!,this.team!,this.x!,this.y!,this.rotation!,this.placeConfig??null)
    }
}
registerPacket(BeginPlaceCallPacket);

class BlockSnapshotCallPacket extends Packet {
    _id = 13;
    _silent = true;
    _lastUpdatedFor = 159;
    amount?:short;
    data?:Buffer;
    getPriority() {
        return 0
    }
    write(buf:DataStream) {
        buf.putShort(this.amount!);
        TypeIO.writeBytes(buf,this.data!);
    }
    read(buf:DataStream) {
        this.amount = buf.getShort();
        this.data = TypeIO.readBytes(buf);
    }
    handleClient(n:NetClient) {
        n.blockSnapshot(this.amount!, this.data!);
    }
}
registerPacket(BlockSnapshotCallPacket);

class BuildDestroyedCallPacket extends Packet {
    _id = 14;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(BuildDestroyedCallPacket);

class BuildHealthUpdateCallPacket extends Packet {
    _id = 15;
    _lastUpdatedFor = 159;
    buildings?:int[];
    write(buf:DataStream) {
        TypeIO.writeIntSeq(buf,this.buildings!)
    }
    read(buf:DataStream) {
        this.buildings = TypeIO.readIntSeq(buf);
    }
    handleClient(n:NetClient) {
        //Tile.buildHealthUpdate(buildings);
    }
}
registerPacket(BuildHealthUpdateCallPacket);

class BuildingControlSelectCallPacket extends Packet {
    _id = 16;
    _lastUpdatedFor = 159;
    player?:int;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeEntity(buf,this.player!);
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(BuildingControlSelectCallPacket);

class ClearItemsCallPacket extends Packet {
    _id = 17;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(ClearItemsCallPacket);

class ClearLiquidsCallPacket extends Packet {
    _id = 18;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(ClearLiquidsCallPacket);

class ClearObjectivesCallPacket extends Packet {
    _id = 19;
    _lastUpdatedFor = 159;
    write(): void {}
    read(): void {}
}
registerPacket(ClearObjectivesCallPacket);

class ClientBinaryPacketReliableCallPacket extends Packet {
    _id = 20;
}
registerPacket(ClientBinaryPacketReliableCallPacket);

class ClientBinaryPacketUnreliableCallPacket extends Packet {
    _id = 21;
}
registerPacket(ClientBinaryPacketUnreliableCallPacket);

class ClientLogicDataReliableCallPacket extends Packet {
    _id = 22;
}
registerPacket(ClientLogicDataReliableCallPacket);

class ClientLogicDataUnreliableCallPacket extends Packet {
    _id = 23;
}
registerPacket(ClientLogicDataUnreliableCallPacket);

class ClientPacketReliableCallPacket extends Packet {
    _id = 24;
}
registerPacket(ClientPacketReliableCallPacket);

class ClientPacketUnreliableCallPacket extends Packet {
    _id = 25;
}
registerPacket(ClientPacketUnreliableCallPacket);

class ClientPlanSnapshotCallPacket extends Packet {
    _id = 26;
    _lastUpdatedFor = 159;
    groupId?:int;
    plans:any;
    write(buf:DataStream){
        buf.putInt(this.groupId!);
        TypeIO.writePlans(buf,this.plans);
    }
    read(buf:DataStream){
        this.groupId = buf.getInt();
        TypeIO.readPlans(buf);
    }
}
registerPacket(ClientPlanSnapshotCallPacket);

class ClientPlanSnapshotReceivedCallPacket extends Packet {
    _id = 27;
    _silent = true;
    _lastUpdatedFor = 159;
    player?:int;
    groupId?:int;
    plans?:ReturnType<typeof TypeIO.readPlans>;
    write(buf:DataStream){
        //TypeIO.writeEntity(buf,this.player!);
        buf.putInt(this.groupId!);
        TypeIO.writePlans(buf,this.plans as Plan[]);
    }
    read(buf:DataStream){
        buf.skip(buf.remaining());
        this._incompletPacket = true;
        return;
        this.player = TypeIO.readEntity(buf);
        this.groupId = buf.getInt();
        this.plans = TypeIO.readPlans(buf);
    }
}
registerPacket(ClientPlanSnapshotReceivedCallPacket);

class ClientSnapshotCallPacket extends Packet {
    _id = 28;
    _silent = true;
    _lastUpdatedFor = 159;
    snapshotID?:int;
    unitID?:int;
    /** If the player is dead */
    dead?:boolean;
    /** The player `x` pos */
    x?:float;
    /** The player `y` pos */
    y?:float;
    /** The player pointer's `x` pos */
    pointerX?:float;
    /** The player pointer's `y` pos */
    pointerY?:float;
    /** The player's rotation? */
    rotation?:float;
    /** I have no clue */
    baseRotation?:float;
    /** The player's `x` Velocity */
    xVelocity?:float;
    /** The player's `y` Velocity */
    yVelocity?:float;
    /** The tile the player is mining */
    mining?:Tile;
    /** If the player is boosting */
    boosting?:boolean;
    /** If the player is shooting */
    shooting?:boolean;
    /** If the player is chatting */
    chatting?:boolean;
    /** If the player is building */
    building?:boolean;
    /** The block the player has sellected? */
    selectedBlock?:nullableString;
    /** The rotation of the block the player has sellected? */
    selectedRotation?:int;
    /** The player's build plans */
    plans?:Plan[];
    /** The `x` pos of the player's viewport */
    viewX?:float;
    /** The `x` pos of the player's viewport */
    viewY?:float;
    /** The width of the player's viewport */
    viewWidth?:float;
    /** The height of the player's viewport */
    viewHeight?:float;
    write(buf:DataStream) {
        buf.putInt(this.snapshotID!);
        buf.putInt(this.unitID!);
        buf.putBoolean(this.dead!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        //say(`[ClientSnapshotCallPacket] Sending pos [yellow](${this.x},${this.y})`);
        buf.putFloat(this.pointerX!);
        buf.putFloat(this.pointerY!);
        buf.putFloat(this.rotation!);
        buf.putFloat(this.baseRotation!);
        buf.putFloat(this.xVelocity!);
        buf.putFloat(this.yVelocity!);
        TypeIO.writeTile(buf,this.mining!);
        buf.putBoolean(this.boosting!);
        buf.putBoolean(this.shooting!);
        buf.putBoolean(this.chatting!);
        buf.putBoolean(this.building!);
        TypeIO.writeBlock(buf,this.selectedBlock!);
        buf.putInt(this.selectedRotation!);
        TypeIO.writePlansQueueNet(buf,this.plans!);
        buf.putFloat(this.viewX!);
        buf.putFloat(this.viewY!);
        buf.putFloat(this.viewWidth!);
        buf.putFloat(this.viewHeight!);
    }
    read(buf:DataStream) {
        this.snapshotID = buf.getInt();
        this.unitID = buf.getInt();
        this.dead = buf.getBoolean();
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        say(`[ClientSnapshotCallPacket] Resieved pos [yellow](${this.x},${this.y})[] for ${formatValue(this.unitID)}.`);
        this.pointerX = buf.getFloat();
        this.pointerY = buf.getFloat();
        this.rotation = buf.getFloat();
        this.baseRotation = buf.getFloat();
        this.xVelocity = buf.getFloat();
        this.yVelocity = buf.getFloat();
        this.mining = TypeIO.readTile(buf)!;
        this.boosting = buf.getBoolean();
        this.shooting = buf.getBoolean();
        this.chatting = buf.getBoolean();
        this.building = buf.getBoolean();
        this.selectedBlock = TypeIO.readBlock(buf);
        this.selectedRotation = buf.getInt();
        this.plans = TypeIO.readPlansQueue(buf);
        this.viewX = buf.getFloat();
        this.viewY = buf.getFloat();
        this.viewWidth = buf.getFloat();
        this.viewHeight = buf.getFloat();
    }
    handleServer(nc:NetClient){
        //nc.clientSnapshot(player, snapshotID, unitID, dead, x, y, pointerX, pointerY, rotation, baseRotation, xVelocity, yVelocity, mining, boosting, shooting, chatting, building, plans, viewX, viewY, viewWidth, viewHeight)
    }
}
registerPacket(ClientSnapshotCallPacket);

class CommandBuildingCallPacket extends Packet {
    _id = 29;
    _lastUpdatedFor = 159;
    player?:int;
    buildings?:int[];
    target?:Vec;
    write(buf: DataStream): void {
        TypeIO.writeInts(buf,this.buildings!);
        TypeIO.writeVec2(buf,this.target!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.buildings = TypeIO.readInts(buf);
        this.target = TypeIO.readVec2(buf);
    }
}
registerPacket(CommandBuildingCallPacket);

class CommandUnitsCallPacket extends Packet {
    _id = 30;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    player?:int;
    unitIds?:int[];
    buildTarget?:BuildPos;
    unitTarget?:NetUnit;
    posTarget?:Vec;
    queueCommand?:boolean;
    finalBatch?:boolean;
    write(buf:DataStream) {
        TypeIO.writeInts(buf,this.unitIds!);
        TypeIO.writeBuilding(buf,this.buildTarget!);
        TypeIO.writeUnit(buf,this.unitTarget!);
        TypeIO.writeVec2(buf,this.posTarget!);
        buf.putBoolean(this.queueCommand!);
        buf.putBoolean(this.finalBatch!);
    }
    read(buf:DataStream) {
        this.player = TypeIO.readEntity(buf);
        this.unitIds = TypeIO.readInts(buf);
        this.buildTarget = TypeIO.readBuilding(buf);
        this.unitTarget = TypeIO.readUnit(buf);
        this.posTarget = TypeIO.readVec2(buf);
        this.queueCommand = buf.getBoolean();
        this.finalBatch = buf.getBoolean();
    }
    handleClient(nc: NetClient): void {
        if (!nc.units) return;
        say(`[CommandUnitsCallPacket] Player [blue]${this.player}[] controlled [acid][italic]${this.unitIds?.length}[italic][] unit(s).`);
        for (let unid of this.unitIds!){
            const unit = nc.units[unid];
            if (!unit) continue;
            unit.lastControlledBy = this.player!;
        }
    }
}
registerPacket(CommandUnitsCallPacket);

class CompleteObjectiveCallPacket extends Packet {
    _id = 31;
    _lastUpdatedFor = 159;
    index?:int;
    write(buf: DataStream): void {
        buf.putInt(this.index!);
    }
    read(buf: DataStream): void {
        this.index = buf.getInt();
    }
}
registerPacket(CompleteObjectiveCallPacket);

class ConnectCallPacket extends Packet {
    _id = 32;
    _lastUpdatedFor = 159;
    ip?:string;
    port?:int;
    write(buf:DataStream) {
        TypeIO.writeString(buf,this.ip!);
        buf.putInt(this.port!)
    }
    read(buf:DataStream) {
        this.ip = TypeIO.readString(buf)!;
        this.port = buf.getInt();
    }
    handleClient(n:NetClient) {
        n.connect(this.port!, this.ip!);
    }
}
registerPacket(ConnectCallPacket);

class ConnectConfirmCallPacket extends Packet {
    _id = 33;
    _lastUpdatedFor = 159;
    write(){}
    read(){}
    handleServer(n:NetClient){
        n.connectConfirm(/*this.player*/);
    }
}
registerPacket(ConnectConfirmCallPacket);

class ConstructFinishCallPacket extends Packet {
    _id = 34;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.contruction;
    tile?:Tile;
    block?:nullableString;
    builder?:NetUnit;
    rotation?:byte;
    team?:byte;
    config?:ReturnType<typeof TypeIO.readObject>;
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.block = TypeIO.readBlock(buf);
        this.builder = TypeIO.readUnit(buf);
        this.rotation = buf.get();
        this.team = TypeIO.readTeam(buf);
        this.config = TypeIO.readObject(buf);
    }
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
        TypeIO.writeBlock(buf,this.block!);
        TypeIO.writeUnit(buf,this.builder!);
        buf.put(this.rotation!);
        TypeIO.writeTeam(buf,this.team!);
        TypeIO.writeObject(buf,this.config!);
    }
}
registerPacket(ConstructFinishCallPacket);

class CopyToClipboardCallPacket extends Packet {
    _id = 35;
    _lastUpdatedFor = 159;
    text?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.text!);
    }
    read(buf: DataStream): void {
        this.text = TypeIO.readString(buf);
    }
    handleClient(): void {
        say(`[CopyToClipboardCallPacket]: [white]${this.text}`);
    }
}
registerPacket(CopyToClipboardCallPacket);

class CreateBulletCallPacket extends Packet {
    _id = 36;
    _lastUpdatedFor = 159;
    /** Bullet Type */
    type?:short;
    team?:byte;
    x?:float;
    y?:float;
    angle?:float;
    damage?:float;
    velocityScl?:float;
    lifetimeScl?:float;
    write(buf: DataStream): void {
        TypeIO.writeBulletTypeRaw(buf, this.type!);
        TypeIO.writeTeam(buf,this.team!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        buf.putFloat(this.angle!);
        buf.putFloat(this.damage!);
        buf.putFloat(this.velocityScl!);
        buf.putFloat(this.lifetimeScl!);
    }
    read(buf: DataStream): void {
        this.type = TypeIO.readBulletTypeRaw(buf);
        this.team = TypeIO.readTeam(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.angle = buf.getFloat();
        this.damage = buf.getFloat();
        this.velocityScl = buf.getFloat();
        this.lifetimeScl = buf.getFloat();
    }
}
registerPacket(CreateBulletCallPacket);

class CreateMarkerCallPacket extends Packet {
    _id = 37;
}
registerPacket(CreateMarkerCallPacket);

class CreateWeatherCallPacket extends Packet {
    _id = 38;
    _lastUpdatedFor = 159;
    weather?:nullableString;
    intensity?:float;
    duration?:float;
    windX?:float;
    windY?:float;
    write(buf: DataStream): void {
        TypeIO.writeWeather(buf,this.weather!);
        buf.putFloat(this.intensity!);
        buf.putFloat(this.duration!);
        buf.putFloat(this.windX!);
        buf.putFloat(this.windY!);
    }
    read(buf: DataStream): void {
        this.weather = TypeIO.readWeather(buf);
        this.intensity = buf.getFloat();
        this.duration = buf.getFloat();
        this.windX = buf.getFloat();
        this.windY = buf.getFloat();
    }
    handleClient(nc: NetClient): void {
        say(`Weather event [acid][bold]${this.weather}[] started.`);
    }
}
registerPacket(CreateWeatherCallPacket);

class DebugStatusClientCallPacket extends Packet {
    _id = 39;
    _lastUpdatedFor = 159;
    value?:int;
    lastClientSnapshot?:int;
    write(buf: DataStream): void {
        buf.putInt(this.value!);
        buf.putInt(this.lastClientSnapshot!);
    }
    read(buf: DataStream): void {
        this.value = buf.getInt();
        this.lastClientSnapshot = buf.getInt();
    }
}
registerPacket(DebugStatusClientCallPacket);

class DebugStatusClientUnreliableCallPacket extends Packet {
    _id = 40;
    _lastUpdatedFor = 159;
    value?:int;
    lastClientSnapshot?:int;
    write(buf: DataStream): void {
        buf.putInt(this.value!);
        buf.putInt(this.lastClientSnapshot!);
    }
    read(buf: DataStream): void {
        this.value = buf.getInt();
        this.lastClientSnapshot = buf.getInt();
    }
}
registerPacket(DebugStatusClientUnreliableCallPacket);

class DeconstructFinishCallPacket extends Packet {
    _id = 41;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.contruction;
    tile?:Tile;
    block?:nullableString;
    builder?:NetUnit;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
        TypeIO.writeBlock(buf,this.block!);
        TypeIO.writeUnit(buf,this.builder!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.block = TypeIO.readBlock(buf);
        this.builder = TypeIO.readUnit(buf);
    }
}
registerPacket(DeconstructFinishCallPacket);

class DeletePlansCallPacket extends Packet {
    _id = 42;
    _lastUpdatedFor = 159;
    player?:int;
    positions?:int[];
    write(buf: DataStream): void {
        TypeIO.writeEntity(buf,this.player!);
        TypeIO.writeInts(buf,this.positions!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.positions = TypeIO.readInts(buf);
    }
}
registerPacket(DeletePlansCallPacket);

class DestroyPayloadCallPacket extends Packet {
    _id = 43;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(DestroyPayloadCallPacket);

class DropItemCallPacket extends Packet {
    _id = 44;
    _lastUpdatedFor = 159;
    angle?:float;
    write(buf:DataStream) {
        buf.putFloat(this.angle!);
    }
    read(buf:DataStream) {
        this.angle = buf.getFloat();
    }
    handleServer(n:any) {
        //InputHandler.dropItem(player, angle)
    }
}
registerPacket(DropItemCallPacket);

class EffectCallPacket extends Packet {
    _id = 45;
    _silent = true;
}
registerPacket(EffectCallPacket);

class EffectCallPacket2 extends Packet {
    _id = 46;
}
registerPacket(EffectCallPacket2);

class EffectReliableCallPacket extends Packet {
    _id = 47;
    _lastUpdatedFor = 159;
    /** Unparsed type */
    effect?:ushort;
    x?:float;
    y?:float;
    rotation?:float;
    /** Unparsed type */
    color?:int;
    write(buf:DataStream):void{
        TypeIO.writeEffect(buf,this.effect!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        buf.putFloat(this.rotation!);
        // I need to replace with with TypeIO.writeColor
        buf.putInt(this.color!);
    }
    read(buf:DataStream): void {
        this.effect = TypeIO.readEffect(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.rotation = buf.getFloat();
        this.color = buf.getInt();
    }
}
registerPacket(EffectReliableCallPacket);

class EntitySnapshotCallPacket extends Packet {
    _id = 48;
    _silent = true;
    _lastUpdatedFor = 159;
    amount?:short;
    data?:Buffer;
    getPriority() {
        return 0
    }
    write(buf:DataStream) {
        buf.putShort(this.amount!);
        TypeIO.writeBytes(buf,this.data!);
    }
    read(buf:DataStream) {
        this.amount = buf.getShort();
        this.data = TypeIO.readBytes(buf);
    }
    handleClient(n:NetClient) {
        n.entitySnapshot(this.amount!, this.data!);
    }
}
registerPacket(EntitySnapshotCallPacket);

class GameOverCallPacket extends Packet {
    _id = 50;
    _lastUpdatedFor = 159;
    winner?:byte;
    write(buf: DataStream): void {
        TypeIO.writeTeam(buf,this.winner!);
    }
    read(buf: DataStream): void {
        this.winner = TypeIO.readTeam(buf);
    }
    handleClient(nc: NetClient): void {
        say(`Game over: The winner is team [acid][bold]${this.winner}[][].`);
    }
}
registerPacket(GameOverCallPacket);

class HideHudTextCallPacket extends Packet {
    _id = 53;
    _lastUpdatedFor = 159;
    read():void{}
    write():void{}
}
registerPacket(HideHudTextCallPacket);

class InfoMessageCallPacket extends Packet {
    _id = 54;
    _lastUpdatedFor = 159;
    message?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
    }
    handleClient(): void {
        say(`[InfoMessageCallPacket]:\n[white]${this.message}\n----------`);
    }
}
registerPacket(InfoMessageCallPacket);

class InfoPopupCallPacket extends Packet {
    _id = 55;
    _lastUpdatedFor = 159;
    message?:nullableString;
    duration?:float;
    align?:int;
    top?:int;
    left?:int;
    bottom?:int;
    right?:int;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
        buf.putFloat(this.duration!);
        buf.putInt(this.align!);
        buf.putInt(this.top!);
        buf.putInt(this.left!);
        buf.putInt(this.bottom!);
        buf.putInt(this.right!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
        this.duration = buf.getFloat();
        this.align = buf.getInt();
        this.top = buf.getInt();
        this.left = buf.getInt();
        this.bottom = buf.getInt();
        this.right = buf.getInt();
    }
    handleClient(nc: NetClient): void {
        say(`[InfoPopupCallPacket]: [white]${this.message}`);
    }
}
registerPacket(InfoPopupCallPacket);

class InfoPopupCallPacket2 extends Packet {
    _id = 56;
    _lastUpdatedFor = 159;
    message?:nullableString;
    id?:nullableString;
    duration?:float;
    align?:int;
    top?:int;
    left?:int;
    bottom?:int;
    right?:int;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
        TypeIO.writeString(buf,this.id!);
        buf.putFloat(this.duration!);
        buf.putInt(this.align!);
        buf.putInt(this.top!);
        buf.putInt(this.left!);
        buf.putInt(this.bottom!);
        buf.putInt(this.right!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
        this.id = TypeIO.readString(buf);
        this.duration = buf.getFloat();
        this.align = buf.getInt();
        this.top = buf.getInt();
        this.left = buf.getInt();
        this.bottom = buf.getInt();
        this.right = buf.getInt();
    }
    handleClient(nc: NetClient): void {
        say(`[InfoPopupCallPacket2]: (ID:[yellow]${this.id}[]) [white]${this.message}`);
    }
}
registerPacket(InfoPopupCallPacket2);

class InfoPopupReliableCallPacket extends Packet {
    _id = 57;
    _lastUpdatedFor = 159;
    message?:nullableString;
    duration?:float;
    align?:int;
    top?:int;
    left?:int;
    bottom?:int;
    right?:int;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
        buf.putFloat(this.duration!);
        buf.putInt(this.align!);
        buf.putInt(this.top!);
        buf.putInt(this.left!);
        buf.putInt(this.bottom!);
        buf.putInt(this.right!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
        this.duration = buf.getFloat();
        this.align = buf.getInt();
        this.top = buf.getInt();
        this.left = buf.getInt();
        this.bottom = buf.getInt();
        this.right = buf.getInt();
    }
    handleClient(nc: NetClient): void {
        say(`[InfoPopupReliableCallPacket]: [white]${this.message}`);
    }
}
registerPacket(InfoPopupReliableCallPacket);

class InfoPopupReliableCallPacket2 extends Packet {
    _id = 58;
    _lastUpdatedFor = 159;
    message?:nullableString;
    id?:nullableString;
    duration?:float;
    align?:int;
    top?:int;
    left?:int;
    bottom?:int;
    right?:int;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
        TypeIO.writeString(buf,this.id!);
        buf.putFloat(this.duration!);
        buf.putInt(this.align!);
        buf.putInt(this.top!);
        buf.putInt(this.left!);
        buf.putInt(this.bottom!);
        buf.putInt(this.right!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
        this.id = TypeIO.readString(buf);
        this.duration = buf.getFloat();
        this.align = buf.getInt();
        this.top = buf.getInt();
        this.left = buf.getInt();
        this.bottom = buf.getInt();
        this.right = buf.getInt();
    }
    handleClient(nc: NetClient): void {
        say(`[InfoPopupReliableCallPacket2]: (ID:[yellow]${this.id}[]) [white]${this.message}`);
    }
}
registerPacket(InfoPopupReliableCallPacket2);

class InfoToastCallPacket extends Packet {
    _id = 59;
    _lastUpdatedFor = 159;
    message?:nullableString;
    duration?:float;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.message!);
        buf.putFloat(this.duration!);
    }
    read(buf: DataStream): void {
        this.message = TypeIO.readString(buf);
        this.duration = buf.getFloat();
    }
    handleClient(): void {
        say(`[InfoToastCallPacket]: [white]${this.message}`);
    }
}
registerPacket(InfoToastCallPacket);

class KickCallPacket extends Packet {
    _id = 60;
    _lastUpdatedFor = 159;
    reason?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.reason!);
    }
    read(buf: DataStream): void {
        this.reason = TypeIO.readString(buf);
    }
    handleClient(_: NetClient): void {
        warn(`Kick because: ${formatValue(this.reason)}.`);
    }
}
registerPacket(KickCallPacket);

class KickCallPacket2 extends Packet {
    _id = 61;
    _lastUpdatedFor = 159;
    reason?:KickReason
    read(buf: DataStream): void {
        const i = buf.get();
        const r = KickReason[i];
        if (!r){
            throwError(`Unknown kick reason: [acid][italic]${i}[][].`);
        }
        this.reason = i;
    }
    write(buf: DataStream): void {
        buf.put(this.reason! as byte);
    }
    handleClient(_: NetClient): void {
        say(`Kicked because [acid][italic]${KickReason[this.reason!]}[][].`);
    }
}
registerPacket(KickCallPacket2);

class LandingPadLandedCallPacket extends Packet {
    _id = 68;
    _lastUpdatedFor = 159;
    tile?:Tile;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf,this.tile!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
    }
}
registerPacket(LandingPadLandedCallPacket);

class LogicExplosionCallPacket extends Packet {
    _id = 69;
    _lastUpdatedFor = 159;
    _silent = true;
    team:any;
    x?:float;
    y?:float;
    radius?:float;
    damage?:float;
    air?:boolean;
    ground?:boolean;
    pierce?:boolean;
    effect?:boolean;
    write(buf: DataStream): void {
        TypeIO.writeTeam(buf,this.team!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        buf.putFloat(this.radius!);
        buf.putFloat(this.damage!);
        buf.putBoolean(this.ground!);
        buf.putBoolean(this.air!);
        buf.putBoolean(this.pierce!);
        buf.putBoolean(this.effect!);
    }
    read(buf: DataStream): void {
        this.team = TypeIO.readTeam(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.radius = buf.getFloat();
        this.damage = buf.getFloat();
        this.ground = buf.getBoolean();
        this.air = buf.getBoolean();
        this.pierce = buf.getBoolean();
        this.effect = buf.getBoolean();
    }
}
registerPacket(LogicExplosionCallPacket);

class OpenURICallPacket extends Packet {
    _id = 72;
    _lastUpdatedFor = 159;
    uri?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.uri!);
    }
    read(buf: DataStream): void {
        this.uri = TypeIO.readString(buf);
    }
    handleClient(): void {
        say(`[OpenURICallPacket]: [underline]${this.uri}[]`);
    }
}
registerPacket(OpenURICallPacket);

class PayloadDroppedCallPacket extends Packet {
    _id = 73;
    _lastUpdatedFor = 159;
    unit?:NetUnit;
    x?:float;
    y?:float;
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
    }
}
registerPacket(PayloadDroppedCallPacket);

class PickedBuildPayloadCallPacket extends Packet {
    _id = 74;
    _lastUpdatedFor = 159;
    unit?:NetUnit;
    build?:BuildPos;
    onGround?:boolean;
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeBuilding(buf,this.build!);
        buf.putBoolean(this.onGround!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.build = TypeIO.readBuilding(buf);
        this.onGround = buf.getBoolean();
    }
}
registerPacket(PickedBuildPayloadCallPacket);

class PickedUnitPayloadCallPacket extends Packet {
    _id = 75;
    _lastUpdatedFor = 159;
    unit?:NetUnit;
    target?:NetUnit;
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeUnit(buf,this.target!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.target = TypeIO.readUnit(buf);
    }
}
registerPacket(PickedUnitPayloadCallPacket);

class PingCallPacket extends Packet {
    _id = 76;
    _lastUpdatedFor = 159;
    time?:long;
    player?:int;
    write(buf:DataStream) {
        buf.putLong(this.time!);
    }
    read(buf:DataStream) {
        this.time = buf.getLong();
    }
    handleServer(n:any) {
        n.ping(this.player, this.time);
    }
}
registerPacket(PingCallPacket);

/** ID 77 */
class PingLocationCallPacket extends Packet {
    _id = 77;
    _lastUpdatedFor = 159;
    player?:int;
    x?:float;
    y?:float;
    text?:nullableString;
    write(buf:DataStream):void{
        //TypeIO.writeEntity(buf,this.player!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        TypeIO.writeString(buf,this.text!);
    }
    read(buf: DataStream):void{
        this.player = TypeIO.readEntity(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.text = TypeIO.readString(buf);
    }
    handleClient(nc: NetClient): void {
        say(`Ping at [yellow]${nc.game.utils.toTilePos(this.x!,this.y!,1)}[]${this.text?` [white]${this.text}[]`:''}.`)
    }
}
registerPacket(PingLocationCallPacket);

class PingResponseCallPacket extends Packet {
    _id = 78;
    _lastUpdatedFor = 159;
    /** The ping in ms */
    time?:long;
    write(buf:DataStream) {
        buf.putLong(this.time!);
    }
    read(buf:DataStream) {
        this.time = buf.getLong();
    }
    handleClient(n:NetClient) {
        //n.pingResponse(this.time);
    }
}
registerPacket(PingResponseCallPacket);

class PlayMusicCallPacket extends Packet {
    _id = 79;
    _lastUpdatedFor = 159;
    musicName?:nullableString;
    interrupt?:boolean;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.musicName!);
        buf.putBoolean(this.interrupt!);
    }
    read(buf: DataStream): void {
        this.musicName = TypeIO.readString(buf);
        this.interrupt = buf.getBoolean();
    }
    handleClient(): void {
        say(`[PlayMusicCallPacket] Song: [white]${this.musicName}[]. Interrupt: ${formatValue(this.interrupt)}`);
    }
}
registerPacket(PlayMusicCallPacket);

class PlayerDisconnectCallPacket extends Packet {
    _id = 80;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    playerid?:int;
    write(buf: DataStream): void {
        buf.putInt(this.playerid!);
    }
    read(buf: DataStream):void{
        this.playerid = buf.getInt();
    }
    handleClient(nc:NetClient): void {
        say(`Player [blue]${this.playerid}[] disconnected.`);
    }
}
registerPacket(PlayerDisconnectCallPacket);

class PlayerSpawnCallPacket extends Packet {
    _id = 81;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    tile?:Point2;
    player?:int;
    write(buf:DataStream) {
        TypeIO.writeTile(buf,this.tile as Tile);
        TypeIO.writeEntity(buf,this.player!);
    }
    read(buf:DataStream) {
        //this.tile = TypeIO.readTile(buf)!;
        this.tile = TypeIO.readTileReliable(buf);
        this.player = TypeIO.readEntity(buf);
    }
    handleClient(nc:NetClient) {
        say(`[PlayerSpawnCallPacket] Player with the ID [acid]${this.player}[] spawned at [yellow](${this.tile!.x},${this.tile!.y})`);
        nc.units![this.player!] = {
            id:this.player,
            position:{
                x:this.tile!.x*8 as float,
                y:this.tile!.y*8 as float
            }
        };
        if (nc.player?.id === this.player){
            nc.player!.unit! = nc.units![this.player!]!;
        }
    }
}
registerPacket(PlayerSpawnCallPacket);

class RequestAssetsCallPacket extends Packet {
    _id = 86;
    _lastUpdatedFor = 159;
    ids?:short[];
    write(buf: DataStream): void {
        TypeIO.writeShorts(buf,this.ids!);
    }
    read(buf: DataStream): void {
        this.ids = TypeIO.readShorts(buf);
    }
}
registerPacket(RequestAssetsCallPacket);

class RequestBuildPayloadCallPacket extends Packet {
    _id = 88;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    player?:int;
    write(buf:DataStream) {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf:DataStream) {
        this.player = TypeIO.readEntity(buf);
        this.build = TypeIO.readBuilding(buf);
    }
    handleServer(ns:any) {
        //InputHandler.requestBuildPayload(player, build)
    }
    handleClient(nc:NetClient) {
        //InputHandler.requestBuildPayload(player, build)
    }
}
registerPacket(RequestBuildPayloadCallPacket);

class RequestDropPayloadCallPacket extends Packet {
    _id = 90;
    _lastUpdatedFor = 159;
    x?:float;
    y?:float;
    player?:number;
    write(buf:DataStream) {
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
    }
    read(buf:DataStream) {
        this.player=TypeIO.readEntity(buf);
        this.x = buf.getFloat();
        this.y = buf.getFloat();
    }
    handleServer(n:any) {
        //InputHandler.requestDropPayload(player, x, y)
    }
    handleClient(n:NetClient) {
        //InputHandler.requestDropPayload(player, x, y)
    }
}
registerPacket(RequestDropPayloadCallPacket);

class RequestItemCallPacket extends Packet {
    _id = 91;
    _lastUpdatedFor = 159;
    player?:int;
    build?:BuildPos;
    item?:nullableString;
    amount?:int;
    write(buf:DataStream) {
        TypeIO.writeBuilding(buf,this.build!);
        TypeIO.writeItem(buf,this.item!);
        buf.putInt(this.amount!);
    }
    read(buf:DataStream) {
        this.player = TypeIO.readEntity(buf);
        this.build = TypeIO.readBuilding(buf);
        this.item = TypeIO.readItem(buf);
        this.amount = buf.getInt();
    }
    handleServer(n:NetClient) {
        //InputHandler.requestItem(player, build, item, amount)
    }
    handleClient(n:NetClient) {
        //InputHandler.requestItem(player, build, item, amount)
    }
}
registerPacket(RequestItemCallPacket);

class RequestUnitPayloadCallPacket extends Packet {
    _id = 92;
    _lastUpdatedFor = 159;
    player?:int;
    target?:NetUnit;
    write(buf: DataStream): void {
        TypeIO.writeEntity(buf,this.player!);
        TypeIO.writeUnit(buf,this.target!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.target = TypeIO.readUnit(buf);
    }
}
registerPacket(RequestUnitPayloadCallPacket);

class RequestWorldCallPacket extends Packet {
    _id = 93;
    _lastUpdatedFor = 159;
    read(){};
}
registerPacket(RequestWorldCallPacket);

class RotateBlockCallPacket extends Packet {
    _id = 95;
    _lastUpdatedFor = 159;
    player?:number;
    build?:BuildPos;
    direction?:byte;
    write(buf:DataStream) {
        TypeIO.writeBuilding(buf,this.build!);
        buf.put(this.direction!);
    }
    read(buf:DataStream) {
        this.player = TypeIO.readEntity(buf);
        this.build = TypeIO.readBuilding(buf);
        this.direction = buf.get();
    }
    handleServer(n:any) {
        //InputHandler.rotateBlock(player, build, direction)
    }
    handleClient(n:NetClient) {
        //InputHandler.rotateBlock(player, build, direction)
    }
}
registerPacket(RotateBlockCallPacket);

class SectorCaptureCallPacket extends Packet {
    _id = 96;
    _lastUpdatedFor = 159;
    read():void{}
    write():void{}
    handleClient(): void {
        say(`[acid][bold]Sector Captured.`);
    }
}
registerPacket(SectorCaptureCallPacket);

class SendChatMessageCallPacket extends Packet {
    _id = 97;
    _silent = true;
    _lastUpdatedFor = 159;
    /** The chat message to send */
    message?:string;
    write(buf:DataStream) {
        TypeIO.writeString(buf,this.message!);
    }
    read(buf:DataStream) {
        this.message=TypeIO.readString(buf)!;
    }
    handleServer(n:any) {
        //n.sendChatMessage(player, message)
    }
}
registerPacket(SendChatMessageCallPacket);
class SendMessageCallPacket extends Packet {
    _id = 98;
    _silent = true;
    _lastUpdatedFor = 159;
    /** The message from the server */
    message?:string;
    write(buf:DataStream) {
        TypeIO.writeString(buf,this.message!);
    }
    read(buf:DataStream) {
        this.message = TypeIO.readString(buf)!;
    }
    handleClient(n:NetClient) {
        //n.sendMessage(this.message);
        say(`Message from [bold][red]the server[][bold]: [white]${this.message}`);
    }
}
registerPacket(SendMessageCallPacket);
class SendMessageCallPacket2 extends Packet {
    _id = 99;
    _silent = true;
    _lastUpdatedFor = 159;
    /** The message from the player */
    message?:string;
    /** The message from the player */
    unformatted?:string;
    /** The ID of the player that sent the message */
    playersender?:int;
    write(buf:DataStream) {
        TypeIO.writeString(buf,this.message!);
        TypeIO.writeString(buf,this.unformatted!);
        TypeIO.writeEntity(buf,this.playersender!);
    }
    read(buf:DataStream) {
        this.message = TypeIO.readString(buf)!;
        this.unformatted = TypeIO.readString(buf)!;
        this.playersender = TypeIO.readEntity(buf)!;
    }
    handleClient(n:NetClient) {
        //say(this.message!);
        //say(this.unformatted!);
        //n.sendMessage(message, unformatted, playersender)
    }
}
registerPacket(SendMessageCallPacket2);

class SetFlagCallPacket extends Packet {
    _id = 105;
    _lastUpdatedFor = 159;
    _silent = true;
    flag?:nullableString;
    add?:boolean;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.flag!);
        buf.putBoolean(this.add!);
    }
    read(buf: DataStream): void {
        this.flag = TypeIO.readString(buf);
        this.add = buf.getBoolean();
    }
}
registerPacket(SetFlagCallPacket);

class SetFloorCallPacket extends Packet {
    _id = 106;
    _lastUpdatedFor = 159;
    tile?:Tile;
    floor?:nullableString;
    overlay?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf, this.tile!);
        TypeIO.writeBlock(buf, this.floor!);
        TypeIO.writeBlock(buf, this.overlay!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.floor = TypeIO.readBlock(buf);
        this.overlay = TypeIO.readBlock(buf);
    }
}
registerPacket(SetFloorCallPacket);

class SetItemsCallPacket extends Packet {
    _id = 110;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    items?:[nullableString, int][];
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
        TypeIO.writeItemStacks(buf,this.items!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
        this.items = TypeIO.readItemStacks(buf);
    }
}
registerPacket(SetItemsCallPacket);

class SetMapAreaCallPacket extends Packet {
    _id = 113;
    _lastUpdatedFor = 159;
    x?:int;
    y?:int;
    w?:int;
    h?:int;
    write(buf: DataStream): void {
        buf.putInt(this.x!);
        buf.putInt(this.y!);
        buf.putInt(this.w!);
        buf.putInt(this.h!);
    }
    read(buf: DataStream): void {
        this.x = buf.getInt();
        this.y = buf.getInt();
        this.w = buf.getInt();
        this.h = buf.getInt();
    }
    handleClient(nc: NetClient): void {
        say(`[SetMapAreaCallPacket]: Map size set to [yellow](${this.x},${this.y})[] with size [yellow]${this.w}x${this.h})`)
    }
}
registerPacket(SetMapAreaCallPacket);

class SetOverlayCallPacket extends Packet {
    _id = 115;
    _lastUpdatedFor = 159;
    tile?:Tile;
    overlay?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf, this.tile!);
        TypeIO.writeBlock(buf, this.overlay!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.overlay = TypeIO.readBlock(buf);
    }
}
registerPacket(SetOverlayCallPacket);

class SetPositionCallPacket extends Packet {
    _id = 117;
    _lastUpdatedFor = 159;
    x?:float;
    y?:float;
    write(buf:DataStream):void{
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
    }
    read(buf:DataStream):void{
        this.x = buf.getFloat();
        this.y = buf.getFloat();
    }
    handleClient(nc: NetClient): void {
        if (!nc.player) return;
        say(`[SetPositionCallPacket] Snapping to [yellow](${this.x},${this.y})`);
        nc.player.unit.position = {
            x:this.x!,
            y:this.y!
        }
        if (!nc.units) return;
        nc.units[nc.player.id]!.position!.x = this.x!;
        nc.units[nc.player.id]!.position!.y = this.x!;
    }
}
registerPacket(SetPositionCallPacket);

class SetRuleCallPacket extends Packet {
    _id = 118;
    _lastUpdatedFor = 159;
    rule?:string;
    jsonData?:string;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.rule!);
        TypeIO.writeString(buf,this.jsonData!);
    }
    read(buf: DataStream): void {
        this.rule = TypeIO.readString(buf)!;
        this.jsonData = TypeIO.readString(buf)!;
    }
}
registerPacket(SetRuleCallPacket);

class SetRulesCallPacket extends Packet {
    _id = 119;
}
registerPacket(SetRulesCallPacket);

class SetTeamCallPacket extends Packet {
    _id = 120;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    team?:any;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
        TypeIO.writeTeam(buf,this.team!);
    }
    read(buf: DataStream): void {
        this.build = TypeIO.readBuilding(buf);
        this.team = TypeIO.readTeam(buf);
    }
}
registerPacket(SetTeamCallPacket);

class SetTeamsCallPacket extends Packet {
    _id = 121;
    _lastUpdatedFor = 159;
    positions?:int[];
    team?:any;
    write(buf: DataStream): void {
        TypeIO.writeInts(buf,this.positions!);
        TypeIO.writeTeam(buf,this.team!);
    }
    read(buf: DataStream): void {
        this.positions = TypeIO.readInts(buf);
        this.team = TypeIO.readTeam(buf);
    }
}
registerPacket(SetTeamsCallPacket);

class SetTileCallPacket extends Packet {
    _id = 122;
    _lastUpdatedFor = 159;
    tile?:Tile;
    block?:nullableString;
    team?:byte;
    rotation?:int;
    write(buf: DataStream): void {
        TypeIO.writeTile(buf, this.tile!);
        TypeIO.writeBlock(buf, this.block!);
        TypeIO.writeTeam(buf, this.team!);
        buf.putInt(this.rotation!);
    }
    read(buf: DataStream): void {
        this.tile = TypeIO.readTile(buf)!;
        this.block = TypeIO.readBlock(buf);
        this.team = TypeIO.readTeam(buf);
        this.rotation = buf.getInt();
    }
}
registerPacket(SetTileCallPacket);

class SetUnitStanceCallPacket extends Packet {
    _id = 129;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    player?:int;
    /** The units' IDs */
    unitIds?:int[];
    /** The unit stance ID */
    stance?:byte;
    enable?:boolean;
    write(buf:DataStream){
        TypeIO.writeEntity(buf,this.player!);
        TypeIO.writeInts(buf,this.unitIds!);
        TypeIO.writeStance(buf,this.stance!);
        buf.putBoolean(this.enable!);
    }
    read(buf:DataStream){
        this.player = TypeIO.readEntity(buf);
        this.unitIds = TypeIO.readInts(buf);
        this.stance = TypeIO.readStance(buf)!;
        this.enable = buf.getBoolean();
    }
    handleClient(nc: NetClient): void {
        if (!nc.units) return;
        say(`[SetUnitStanceCallPacket] Player [blue]${this.player}[] set [acid][italic]${this.unitIds?.length}[italic][] unit(s)' stance to [acid]${this.stance}[].`);
        for (let unid of this.unitIds!){
            const unit = nc.units[unid];
            if (!unit) continue;
            unit.stance = this.stance!;
            unit.lastControlledBy = this.player!;
        }
    }
}
registerPacket(SetUnitStanceCallPacket);

class SetUnitCommandCallPacket extends Packet {
    _id = 128;
    _lastUpdatedFor = 159;
    player?:int;
    unitIds?:int[];
    command?:nullableByte;
    write(buf: DataStream): void {
        TypeIO.writeInts(buf,this.unitIds!);
        TypeIO.writeCommand(buf,this.command!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.unitIds = TypeIO.readInts(buf);
        this.command = TypeIO.readCommand(buf);
    }
    handleClient(nc: NetClient): void {
        if (!nc.units) return;
        say(`[SetUnitCommandCallPacket] Player [blue]${this.player}[] set [acid][italic]${this.unitIds?.length}[italic][] unit(s)' command to [acid]${this.command}[].`);
        for (let unid of this.unitIds!){
            const unit = nc.units[unid];
            if (!unit) continue;
            unit.command = this.command!;
            unit.lastControlledBy = this.player!;
        }
    }
}
registerPacket(SetUnitCommandCallPacket);

class SpawnEffectCallPacket extends Packet {
    _id = 132;
    _lastUpdatedFor = 159;
    x?:float;
    y?:float;
    rotation?:float;
    /** Note: This currently only gets the **raw** data, it will need to be mapped later. */
    unitType?:short;
    write(buf: DataStream): void {
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        buf.putFloat(this.rotation!);
        TypeIO.writeUnitTypeRaw(buf,this.unitType!);
    }
    read(buf: DataStream): void {
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.rotation = buf.getFloat();
        TypeIO.readUnitTypeRaw(buf);
    }
}
registerPacket(SpawnEffectCallPacket);

class StateSnapshotCallPacket extends Packet {
    _id = 133;
    _silent = true;
    _lastUpdatedFor = 159;
    waveTime?:float;
    wave?:int;
    enemies?:int;
    paused?:boolean;
    gameOver?:boolean;
    timeData?:int;
    tps?:byte;
    rand0?:long;
    rand1?:long;
    coreData?:Buffer;
    getPriority() {
        return 0;
    }
    // Do I even need this? I I'm 99.99% sure this is server side only.
    write(buf:DataStream) {
        buf.putFloat(this.waveTime!);
        buf.putInt(this.wave!);
        buf.putInt(this.enemies!);
        buf.putBoolean(this.paused!);
        buf.putBoolean(this.gameOver!);
        buf.putInt(this.timeData!);
        buf.put(this.tps!);
        buf.putLong(this.rand0!);
        buf.putLong(this.rand1!);
        TypeIO.writeBytes(buf,this.coreData!);
    }
    read(buf:DataStream) {
        this.waveTime = buf.getFloat();
        this.wave = buf.getInt();
        this.enemies = buf.getInt();
        this.paused = buf.getBoolean();
        this.gameOver = buf.getBoolean();
        this.timeData = buf.getInt();
        this.tps = buf.get();
        this.rand0 = buf.getLong();
        this.rand1 = buf.getLong();
        this.coreData = TypeIO.readBytes(buf);
    }
    handleClient(n:NetClient) {
        n.stateSnapshot(this.waveTime!, this.wave!, this.enemies!, this.paused!, this.gameOver!, this.timeData!, this.tps!, this.rand0!, this.rand1!, this.coreData!);
    }
}
registerPacket(StateSnapshotCallPacket);

class SyncVariableCallPacket extends Packet {
    _id = 134;
    _silent = true;
}
registerPacket(SyncVariableCallPacket);

class TakeItemsCallPacket extends Packet {
    _id = 135;
    _lastUpdatedFor = 159;
    build?:BuildPos;
    item?:nullableString;
    amount?:int;
    to?:NetUnit;
    write(buf:DataStream) {
        TypeIO.writeBuilding(buf,this.build!);
        TypeIO.writeItem(buf,this.item!);
        buf.putInt(this.amount!);
        TypeIO.writeUnit(buf,this.to!);
    }
    read(buf:DataStream) {
        this.build = TypeIO.readBuilding(buf);
        this.item = TypeIO.readItem(buf);
        this.amount = buf.getInt();
        this.to = TypeIO.readUnit(buf);
    }
    handleClient(n:NetClient) {
        //InputHandler.takeItems(build, item, amount, to)
    }
}
registerPacket(TakeItemsCallPacket);

class TileConfigCallPacket extends Packet {
    _id = 139;
    _lastUpdatedFor = 159;
    player?:int;
    build?:BuildPos;
    value?:ReturnType<typeof TypeIO.readObject>;
    write(buf: DataStream): void {
        TypeIO.writeBuilding(buf,this.build!);
        TypeIO.writeObject(buf,this.value!);
    }
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.build = TypeIO.readBuilding(buf);
        this.value = TypeIO.readObject(buf);
    }
}
registerPacket(TileConfigCallPacket);

class TileTapCallPacket extends Packet {
    _id = 140;
    _lastUpdatedFor = 159;
    player?:int;
    tile?:Tile;
    read(buf: DataStream): void {
        this.player = TypeIO.readEntity(buf);
        this.tile = TypeIO.readTile(buf)!;
    }
    write(buf: DataStream): void {
        TypeIO.writeEntity(buf,this.player!);
        TypeIO.writeTile(buf,this.tile!);
    }
    handleClient(): void {
        say(`Player [blue]${this.player}[] tapped tile [yellow]${this.tile!.toPosString()}[].`);
    }
}
registerPacket(TileTapCallPacket);

class TransferInventoryCallPacket extends Packet {
    _id = 142;
    _lastUpdatedFor = 159;
    player?:int;
    build?:BuildPos;
    write(buf:DataStream) {
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf:DataStream) {
        this.player=TypeIO.readEntity(buf);
        this.build=TypeIO.readBuilding(buf);
    }
    handleServer(n:any) {
        //InputHandler.transferInventory(player, build)
    }
    handleClient(n:NetClient) {
        //InputHandler.transferInventory(player, build)
    }
}
registerPacket(TransferInventoryCallPacket);

class TransferItemToCallPacket extends Packet {
    _id = 144;
    _lastUpdatedFor = 159;
    unit?:NetUnit;
    item?:nullableString;
    amount?:int;
    x?:float;
    y?:float;
    build?:BuildPos;
    write(buf:DataStream):void{
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeItem(buf,this.item!);
        buf.putInt(this.amount!);
        buf.putFloat(this.x!);
        buf.putFloat(this.y!);
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.item = TypeIO.readItem(buf);
        this.amount = buf.getInt();
        this.x = buf.getFloat();
        this.y = buf.getFloat();
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(TransferItemToCallPacket);

class UnitBlockSpawnCallPacket extends Packet {
    _id = 146;
    _hidden = config.hideGroup.units;
}
registerPacket(UnitBlockSpawnCallPacket);

class UnitBuildingControlSelectCallPacket extends Packet {
    _id = 147;
    _lastUpdatedFor = 159;
    unit?:NetUnit;
    build?:BuildPos;
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
        TypeIO.writeBuilding(buf,this.build!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
        this.build = TypeIO.readBuilding(buf);
    }
}
registerPacket(UnitBuildingControlSelectCallPacket);

class UnitClearCallPacket extends Packet {
    _id = 149;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    player?:int;
    write(){}
    read(buf:DataStream){
        this.player=TypeIO.readEntity(buf);
    }
    handleClient(n:NetClient){
        //InputHandler.unitClear(player)
    }
}
registerPacket(UnitClearCallPacket);

class UnitControlCallPacket extends Packet {
    _id = 150;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    player?:int;
    /** `[type, id]` */
    unit?:[byte,int];
    write(buf:DataStream) {
        TypeIO.writeUnit(buf,this.unit!);
    }
    read(buf:DataStream) {
        this.player=TypeIO.readEntity(buf);
        this.unit=TypeIO.readUnit(buf);
    }
    handleServer(n:any) {
        //InputHandler.unitControl(player, unit)
    }
    handleClient(n:NetClient) {
        //InputHandler.unitControl(player, unit)
    }
}
registerPacket(UnitControlCallPacket);

class UnitDeathCallPacket extends Packet {
    _id = 151;
    _lastUpdatedFor = 159;
    _hidden = config.hideGroup.units;
    /** The unit's ID */
    uid?:int;
    write(buf:DataStream) {
        buf.putInt(this.uid!);
    }
    read(buf:DataStream) {
        this.uid = buf.getInt()
    }
    handleClient(nc:NetClient) {
        if (!nc.units) return;
        say(`[UnitDeathCallPacket] Deleting unit [italic]${formatValue(this.uid)}`);
        if (!nc.units[this.uid!]){
            warn(`Unit [italic]${formatValue(this.uid)}[italic] does not exist.`)
        }else{
            delete nc.units![this.uid!];
        }
    }
}
registerPacket(UnitDeathCallPacket);

class UnitDespawnCallPacket extends Packet {
    _id = 152;
    _lastUpdatedFor = 159;
    _silent = config.hideGroup.units;
    unit?:NetUnit;
    write(buf: DataStream): void {
        TypeIO.writeUnit(buf,this.unit!);
    }
    read(buf: DataStream): void {
        this.unit = TypeIO.readUnit(buf);
    }
    handleClient(nc: NetClient): void {
        say(`[UnitDespawnCallPacket] Deleting unit [italic]${formatValue(this.unit![1])}`);
        if (!nc.units![this.unit![1]]){
            warn(`Unit [italic]${formatValue(this.unit![1])}[italic] does not exist.`);
        }else{
            delete nc.units![this.unit![1]];
        }
    }
}
registerPacket(UnitDespawnCallPacket);

class UnitDestroyCallPacket extends Packet {
    _id = 153;
    _hidden = config.hideGroup.units;
    _lastUpdatedFor = 159;
    /** The unit's ID */
    uid?:int;
    write(buf:DataStream) {
        buf.putInt(this.uid!);
    }
    read(buf:DataStream) {
        this.uid = buf.getInt();
    }
    handleClient(nc:NetClient) {
        say(`[UnitDestroyCallPacket]Deleting unit [italic]${formatValue(this.uid)}`);
        if (!nc.units![this.uid!]){
            warn(`Unit [italic]${formatValue(this.uid)} does not exist.`)
        }else{
            delete nc.units![this.uid!];
        }
    }
}
registerPacket(UnitDestroyCallPacket);


class UnitEnteredPayloadCallPacket extends Packet {
    _id = 154;
    _hidden = config.hideGroup.units;
}
registerPacket(UnitEnteredPayloadCallPacket);

class UnitSpawnCallPacket extends Packet {
    _id = 157;
    //_hidden = config.hideGroup.units;
    _lastUpdatedFor = 159;
    read(buf: DataStream): void {
        TypeIO.readUnitContainer(buf);
    }
}
registerPacket(UnitSpawnCallPacket);

class UpdateGameOverCallPacket extends Packet {
    _id = 159;
    _lastUpdatedFor = 159;
    winner:any;
    write(buf: DataStream): void {
        TypeIO.writeTeam(buf,this.winner!);
    }
    read(buf: DataStream): void {
        this.winner = TypeIO.readTeam(buf);
    }
    handleClient(): void {
        say(`[UpdateGameOverCallPacket]: Team ${formatValue(this.winner)} is victorius.`);
    }
}
registerPacket(UpdateGameOverCallPacket);

class WarningToastCallPacket extends Packet {
    _id = 163;
    _lastUpdatedFor = 159;
    unicode?:nullableInt;
    text?:nullableString;
    write(buf: DataStream): void {
        buf.putInt(this.unicode!);
        TypeIO.writeString(buf,this.text!);
    }
    read(buf: DataStream): void {
        this.unicode = buf.getInt();
        this.text = TypeIO.readString(buf);
    }
    handleClient(): void {
        say(`[WarningToastCallPacket]: [white](Unicode icon:[acid]${this.unicode}[white]) ${this.text}`);
    }
}
registerPacket(WarningToastCallPacket);

class WorldDataBeginCallPacket extends Packet {
    _id = 164;
    _lastUpdatedFor = 159;
    write(): void {}
    read(): void {}
}
registerPacket(WorldDataBeginCallPacket);

export const packets = {
    Packet,                                 // Template
    StreamBegin,                            // ID 0  <| All of                               |
    StreamChunk,                            // ID 1  <| these should                         |
    WorldStream,                            // ID 2  <| be constant                          |
    ConnectPacket,                          // ID 3  <| ------------------------------------ |
    AssetRequirementStream,                 // ID 4  <| New Packet: 159.2                    |
    AssetStream,                            // ID 5  <| New Packet: 159.2                    |
    AdminRequestCallPacket,                 // ID 6   | Pending        |                     |
    AnnounceCallPacket,                     // ID 7   | Pending        |                     |
    AssemblerDroneSpawnedCallPacket,        // ID 8   | Pending        |                     |
    AssemblerUnitSpawnedCallPacket,         // ID 9   | Pending        |                     |
    AutoDoorToggleCallPacket,               // ID 10  | Confirmed      |                     |
    BeginBreakCallPacket,                   // ID 11  | Confirmed      |                     |
    BeginPlaceCallPacket,                   // ID 12  | Confirmed      |                     |
    BlockSnapshotCallPacket,                // ID 13  | Pending        |                     |
    BuildDestroyedCallPacket,               // ID 14  | Pending        |                     |
    BuildHealthUpdateCallPacket,            // ID 15  | Pending        |                     |
    BuildingControlSelectCallPacket,        // ID 16  | Pending        |                     |
    ClearItemsCallPacket,                   // ID 17  | Pending        |                     |
    ClearLiquidsCallPacket,                 // ID 18  | Pending        |                     |
    ClearObjectivesCallPacket,              // ID 19  | Pending        |                     |
    ClientBinaryPacketReliableCallPacket,   // ID 20  |                |                     |
    ClientBinaryPacketUnreliableCallPacket, // ID 21  |                |                     |
    ClientLogicDataReliableCallPacket,      // ID 22  |                |                     |
    ClientLogicDataUnreliableCallPacket,    // ID 23  |                |                     |
    ClientPacketReliableCallPacket,         // ID 24  |                |                     |
    ClientPacketUnreliableCallPacket,       // ID 25  |                |                     |
    ClientPlanSnapshotCallPacket,           // ID 26  | Untested       | Updated for 159.2   |
    ClientPlanSnapshotReceivedCallPacket,   // ID 27  | Pending        |                     |
    ClientSnapshotCallPacket,               // ID 28  | Mostly Working |                     |
    CommandBuildingCallPacket,              // ID 29  | Pending        |                     |
    CommandUnitsCallPacket,                 // ID 30  | Pending        |                     |
    CompleteObjectiveCallPacket,            // ID 31  | Pending        |                     |
    ConnectCallPacket,                      // ID 32  | I think?       |                     |
    ConnectConfirmCallPacket,               // ID 33  | Confirmed      |                     |
    ConstructFinishCallPacket,              // ID 34  | Confirmed      |                     |
    CopyToClipboardCallPacket,              // ID 35  | Pending        |                     |
    CreateBulletCallPacket,                 // ID 36  | Pending        |                     |
    CreateMarkerCallPacket,                 // ID 37  |                |                     |
    CreateWeatherCallPacket,                // ID 38  | Pending        |                     |
    DebugStatusClientCallPacket,            // ID 39  | Pending        |                     |
    DebugStatusClientUnreliableCallPacket,  // ID 40  | Pending        |                     |
    DeconstructFinishCallPacket,            // ID 41  | Confirmed      |                     |
    DeletePlansCallPacket,                  // ID 42  | Pending        |                     |
    DestroyPayloadCallPacket,               // ID 43  | Pending        |                     |
    DropItemCallPacket,                     // ID 44  | Confirmed      |                     |
    EffectCallPacket,                       // ID 45  |                |                     |
    EffectCallPacket2,                      // ID 46  |                |                     |
    EffectReliableCallPacket,               // ID 47  | Pending        |                     |
    EntitySnapshotCallPacket,               // ID 48  | Handler broken |                     |

    GameOverCallPacket,                     // ID 50  | Pending        |                     |

    HideHudTextCallPacket,                  // ID 53  | Blank packet   |                     |
    InfoMessageCallPacket,                  // ID 54  | Confirmed      |                     |
    InfoPopupCallPacket,                    // ID 55  | Confirmed      |                     |
    InfoPopupCallPacket2,                   // ID 56  | Pending        |                     |
    InfoPopupReliableCallPacket,            // ID 57  | Pending        |                     |
    InfoPopupReliableCallPacket2,           // ID 58  | Pending        |                     |
    InfoToastCallPacket,                    // ID 59  | Pending        |                     |
    KickCallPacket,                         // ID 60  | Confirmed      |                     |
    KickCallPacket2,                        // ID 61  | Pending        |                     |

    LandingPadLandedCallPacket,             // ID 68  | Pending        |                     |
    LogicExplosionCallPacket,               // ID 69  | Pending        |                     |

    OpenURICallPacket,                      // ID 72  | Confirmed      |                     |
    PayloadDroppedCallPacket,               // ID 73  | Pending        |                     |
    PickedBuildPayloadCallPacket,           // ID 74  | Pending        |                     |
    PickedUnitPayloadCallPacket,            // ID 75  | Pending        |                     |
    PingCallPacket,                         // ID 76  | Confirmed      |                     |
    PingLocationCallPacket,                 // ID 77  | Confirmed      |                     |
    PingResponseCallPacket,                 // ID 78  | Confirmed      |                     |
    PlayMusicCallPacket,                    // ID 79  | Confirmed      |                     |
    PlayerDisconnectCallPacket,             // ID 80  | Confirmed      |                     |
    PlayerSpawnCallPacket,                  // ID 81  | Mostly         | Updated for 159.2   |

    RequestAssetsCallPacket,                // ID 86  | Pending        |                     |

    RequestBuildPayloadCallPacket,          // ID 88  | Pending        |                     |

    RequestDropPayloadCallPacket,           // ID 90  | Pending        |                     |
    RequestItemCallPacket,                  // ID 91  | Pending        |                     |
    RequestUnitPayloadCallPacket,           // ID 92  | Pending        |                     |
    RequestWorldCallPacket,                 // ID 93  | Pending        |                     |

    RotateBlockCallPacket,                  // ID 95  | Confirmed      | Work on handler     |
    SectorCaptureCallPacket,                // ID 96  | Blank Packet   |                     |
    SendChatMessageCallPacket,              // ID 97  | Confirmed      |                     |
    SendMessageCallPacket,                  // ID 98  | Confirmed      |                     |
    SendMessageCallPacket2,                 // ID 99  | Confirmed      |                     |

    SetFlagCallPacket,                      // ID 105 | Pending        |                     |
    SetFloorCallPacket,                     // ID 106 | Pending        |                     |

    SetItemsCallPacket,                     // ID 110 | Pending        |                     |

    SetMapAreaCallPacket,                   // ID 113 | Pending        |                     |

    SetOverlayCallPacket,                   // ID 115 | Pending        |                     |

    SetPositionCallPacket,                  // ID 117 | Pending        |                     |
    SetRuleCallPacket,                      // ID 118 | Pending        |                     |
    SetRulesCallPacket,                     // ID 119 |                |                     |
    SetTeamCallPacket,                      // ID 120 | Pending        |                     |
    SetTeamsCallPacket,                     // ID 121 | Pending        |                     |
    SetTileCallPacket,                      // ID 122 | Pending        |                     |

    SetUnitCommandCallPacket,               // ID 128 |                |                     |
    SetUnitStanceCallPacket,                // ID 129 | Pending        |                     |

    SpawnEffectCallPacket,                  // ID 132 | Pending        |                     |
    StateSnapshotCallPacket,                // ID 133 | Pending        | Updated for 159.2   |
    SyncVariableCallPacket,                 // ID 134 |                |                     |
    TakeItemsCallPacket,                    // ID 135 | Pending        | Check for 159.2     |

    TileConfigCallPacket,                   // ID 139 | Broken         |                     |
    TileTapCallPacket,                      // ID 140 | Confirmed      |                     |

    TransferInventoryCallPacket,            // ID 142 | Pending        |                     |

    TransferItemToCallPacket,               // ID 144 | Fix later      | Check for 159.2     |

    UnitBlockSpawnCallPacket,               // ID 146 |                |                     |
    UnitBuildingControlSelectCallPacket,    // ID 147 | Pending        |                     |

    UnitClearCallPacket,                    // ID 149 | Pending        |                     |
    UnitControlCallPacket,                  // ID 150 | Pending        |                     |
    UnitDeathCallPacket,                    // ID 151 | Pending        |                     |
    UnitDespawnCallPacket,                  // ID 152 | Pending        |                     |
    UnitDestroyCallPacket,                  // ID 153 | Pending        |                     |
    UnitEnteredPayloadCallPacket,           // ID 154 |                |                     |

    UnitSpawnCallPacket,                    // ID 157 |                |                     |

    UpdateGameOverCallPacket,               // ID 159 | Confirmed      |                     |

    WarningToastCallPacket,                 // ID 163 | Confirmed      | TODO: Map charaters |
    WorldDataBeginCallPacket,               // ID 164 | Blank packet   |                     |

    get : (n:number) => Packets.get(n)
}

say(`Validating packets...`);
const tempStream = DataStream.allocate(0);
let packetCount = 0;
let placeholderPacketCount = 0;
let packetsToUpdate = 0;
for (let i=0;i<255;i++){
    const packet = Packets.get(i);
    if (!packet) continue;
    packetCount++;
    const packetInstance = new packet();
    const packetName = namePacket(packet);
    let packetVersion = packetInstance._lastUpdatedFor;
    if (!packetVersion){ // In case it is a placeholder packet that has the data defined on read.
        try {
            packetInstance.read(tempStream);
            packetVersion = packetInstance._lastUpdatedFor!;
        }catch(e){}
        tempStream.clear();
    }
    if (packetInstance._incompletPacket){
        placeholderPacketCount++;
        if (!config.hideIncompletPacketWarning){
            warn(`Packet [acid][italic]${packetName}[][] (ID:[acid]${i}[]) is a placholder.`)
        }
    }
    if (!packetVersion){
        warn(`Packet [acid][italic]${packetName}[][] (ID:[acid]${i}[]) does not have a version!`);
        packetsToUpdate++;
    }else if (packetVersion < config.version){
        warn(`Packet [acid][italic]${packetName}[][] (ID:[acid]${i}[]) may need updating! Packet version: [acid]${packetVersion}[]. Current version: [acid]${config.version}[].`);
        packetsToUpdate++;
    }else if (Math.floor(packetVersion) > config.version){
        warn(`Packet [acid][italic]${packetName}[][] (ID:[acid]${i}[]) either has a incorrect version or the global version config needs updating! Packet version: [acid]${packetVersion}[]. Current version: [acid]${config.version}[].`);
        packetsToUpdate++;
    }
    if (!(packetName in packets)){
        warn(`Packet [acid][italic]${packetName}[][] (ID:[acid]${i}[]) is not defined in the packet lookup object but is registered.`);
    }
}
say(`[white]${packetCount}[] packets loaded.`);
if (placeholderPacketCount > 0){
    say(`[white]${placeholderPacketCount}[] placeholder packet${placeholderPacketCount === 1 ? '':'s'}.`);
}
if (packetsToUpdate > 0){
    say(`[white]${packetsToUpdate}[] packet${packetsToUpdate === 1 ? '':'s'} may need updating.`);
}

say(`Packets loaded.`);