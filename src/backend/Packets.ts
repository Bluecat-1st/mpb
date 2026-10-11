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
        throwError(`Can't register two packets of the same ID [acid]${id}[]. (Old packet: [acid]${namePacket(id)}[] New packet: [acid]${namePacket(packet)}[])`);
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
    _lastUpdatedFor = 160;
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
    _lastUpdatedFor = 160;
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
    _lastUpdatedFor = 160;
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

class TextureStream extends Packet {
    _id = 6;
}
registerPacket(TextureStream);

class AdminRequestCallPacket extends Packet {
    _id = 7;
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
    _id = 8;
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
    _id = 9;
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
    _id = 10;
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
    _id = 11;
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
    _id = 12;
    _lastUpdatedFor = 160;
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
    _id = 13;
    _lastUpdatedFor = 160;
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
    _id = 14;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 15;
    _lastUpdatedFor = 160;
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
    _id = 16;
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
    _id = 17;
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
registerPacket(ClearItemsCallPacket);

class ClearLiquidsCallPacket extends Packet {
    _id = 19;
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
    _id = 20;
    _lastUpdatedFor = 159;
    write(): void {}
    read(): void {}
}
registerPacket(ClearObjectivesCallPacket);

class ClientBinaryPacketReliableCallPacket extends Packet {
    _id = 21;
}
registerPacket(ClientBinaryPacketReliableCallPacket);

class ClientBinaryPacketUnreliableCallPacket extends Packet {
    _id = 22;
}
registerPacket(ClientBinaryPacketUnreliableCallPacket);

class ClientLogicDataReliableCallPacket extends Packet {
    _id = 23;
}
registerPacket(ClientLogicDataReliableCallPacket);

class ClientLogicDataUnreliableCallPacket extends Packet {
    _id = 24;
}
registerPacket(ClientLogicDataUnreliableCallPacket);

class ClientPacketReliableCallPacket extends Packet {
    _id = 25;
}
registerPacket(ClientPacketReliableCallPacket);

class ClientPacketUnreliableCallPacket extends Packet {
    _id = 26;
}
registerPacket(ClientPacketUnreliableCallPacket);

class ClientPlanSnapshotCallPacket extends Packet {
    _id = 27;
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
    _id = 28;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 29;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 30;
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
    _id = 31;
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
    _id = 32;
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
    _id = 33;
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
    _id = 34;
    _lastUpdatedFor = 160;
    write(){}
    read(){}
    handleServer(n:NetClient){
        n.connectConfirm(/*this.player*/);
    }
}
registerPacket(ConnectConfirmCallPacket);

class ConstructFinishCallPacket extends Packet {
    _id = 35;
    _lastUpdatedFor = 160;
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
    _id = 36;
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
    _id = 37;
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
    _id = 38;
}
registerPacket(CreateMarkerCallPacket);

class CreateWeatherCallPacket extends Packet {
    _id = 39;
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
registerPacket(DebugStatusClientCallPacket);

class DebugStatusClientUnreliableCallPacket extends Packet {
    _id = 41;
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
    _id = 42;
    _lastUpdatedFor = 160;
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
    _id = 43;
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
    _id = 44;
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
    _id = 45;
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
    _id = 46;
    _silent = true;
}
registerPacket(EffectCallPacket);

class EffectCallPacket2 extends Packet {
    _id = 47;
}
registerPacket(EffectCallPacket2);

class EffectReliableCallPacket extends Packet {
    _id = 48;
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
    _id = 49;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 54;
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
    _id = 57;
    _lastUpdatedFor = 159;
    read():void{}
    write():void{}
}
registerPacket(HideHudTextCallPacket);

class InfoMessageCallPacket extends Packet {
    _id = 59;
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
    _id = 60;
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
    _id = 61;
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
    _id = 62;
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
    _id = 63;
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
    _id = 64;
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
    _id = 65;
    _lastUpdatedFor = 159;
    reason?:nullableString;
    write(buf: DataStream): void {
        TypeIO.writeString(buf,this.reason!);
    }
    read(buf: DataStream): void {
        this.reason = TypeIO.readString(buf);
    }
    handleClient(nc: NetClient): void {
        warn(`Kick because: ${formatValue(this.reason)}.`);
        nc.attempedReconnect = true; // Don't try to reconnect.
    }
}
registerPacket(KickCallPacket);

class KickCallPacket2 extends Packet {
    _id = 66;
    _lastUpdatedFor = 159;
    reason?:KickReason
    read(buf: DataStream): void {
        const i = buf.get();
        const r = KickReason[i];
        if (!r){
            throwError(`Unknown kick reason: [acid][italic]${i}[].`);
        }
        this.reason = i;
    }
    write(buf: DataStream): void {
        buf.put(this.reason! as byte);
    }
    handleClient(nc: NetClient): void {
        say(`Kicked because [acid][italic]${KickReason[this.reason!]}[].`);
        nc.attempedReconnect = true; // Don't try to reconnect.
    }
}
registerPacket(KickCallPacket2);

class LandingPadLandedCallPacket extends Packet {
    _id = 73;
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
    _id = 74;
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
    _id = 80;
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
    _id = 81;
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
    _id = 82;
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
    _id = 83;
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
    _id = 84;
    _lastUpdatedFor = 160;
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

/** ID 85 */
class PingLocationCallPacket extends Packet {
    _id = 85;
    _lastUpdatedFor = 160;
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
    _id = 86;
    _lastUpdatedFor = 160;
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
    _id = 87;
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
    _id = 88;
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
    _id = 89;
    _lastUpdatedFor = 160;
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
    _id = 94;
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
    _id = 96;
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
    _id = 98;
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
    _id = 99;
    _lastUpdatedFor = 160;
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
    _id = 100;
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
    _id = 101;
    _lastUpdatedFor = 159;
    read(){};
}
registerPacket(RequestWorldCallPacket);

class RotateBlockCallPacket extends Packet {
    _id = 103;
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
    _id = 104;
    _lastUpdatedFor = 159;
    read():void{}
    write():void{}
    handleClient(): void {
        say(`[acid][bold]Sector Captured.`);
    }
}
registerPacket(SectorCaptureCallPacket);

class SendChatMessageCallPacket extends Packet {
    _id = 105;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 106;
    _silent = true;
    _lastUpdatedFor = 160;
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
        say(`Message from [bold][red]the server[]: [white]${this.message}`);
    }
}
registerPacket(SendMessageCallPacket);
class SendMessageCallPacket2 extends Packet {
    _id = 107;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 113;
    _lastUpdatedFor = 160;
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
    _id = 114;
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
    _id = 118;
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
    _id = 121;
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
    _id = 123;
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
    _id = 125;
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
    _id = 126;
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
    _id = 127;
}
registerPacket(SetRulesCallPacket);

class SetTeamCallPacket extends Packet {
    _id = 128;
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
    _id = 129;
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
    _id = 130;
    _lastUpdatedFor = 160;
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
    _id = 136;
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
    _id = 137;
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
    _id = 140;
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
    _id = 141;
    _silent = true;
    _lastUpdatedFor = 160;
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
    _id = 142;
    _silent = true;
}
registerPacket(SyncVariableCallPacket);

class TakeItemsCallPacket extends Packet {
    _id = 143;
    _lastUpdatedFor = 160;
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
    _id = 147;
    _lastUpdatedFor = 160;
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
    _id = 148;
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
    _id = 150;
    _lastUpdatedFor = 160;
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
    _id = 152;
    _lastUpdatedFor = 160;
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
    _id = 154;
    _hidden = config.hideGroup.units;
}
registerPacket(UnitBlockSpawnCallPacket);

class UnitBuildingControlSelectCallPacket extends Packet {
    _id = 155;
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
    _id = 157;
    _lastUpdatedFor = 160;
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
    _id = 158;
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
    _id = 159;
    _lastUpdatedFor = 160;
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
    _id = 160;
    _lastUpdatedFor = 160;
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
    _id = 161;
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
    _id = 162;
    _hidden = config.hideGroup.units;
}
registerPacket(UnitEnteredPayloadCallPacket);

class UnitSpawnCallPacket extends Packet {
    _id = 165;
    //_hidden = config.hideGroup.units;
    _lastUpdatedFor = 160;
    read(buf: DataStream): void {
        TypeIO.readUnitContainer(buf);
    }
}
registerPacket(UnitSpawnCallPacket);

class UpdateGameOverCallPacket extends Packet {
    _id = 167;
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
    _id = 171;
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
    _id = 172;
    _lastUpdatedFor = 159;
    write(): void {}
    read(): void {}
}
registerPacket(WorldDataBeginCallPacket);

export const packets = {
    Packet,                                 // Template
    StreamBegin,                            // ID 0  <| All of                                   |
    StreamChunk,                            // ID 1  <| these should                             |
    WorldStream,                            // ID 2  <| be constant                              |
    ConnectPacket,                          // ID 3  <| ---------------------------------------- |
    AssetRequirementStream,                 // ID 4  <| New Packet: 159                          |
    AssetStream,                            // ID 5  <| New Packet: 159                          |
  //TextureStream                           // ID 6  <| New Packet: 160
    AdminRequestCallPacket,                 // ID 7   | Pending        |                         |
    AnnounceCallPacket,                     // ID 8   | Pending        |                         |
    AssemblerDroneSpawnedCallPacket,        // ID 9   | Pending        |                         |
    AssemblerUnitSpawnedCallPacket,         // ID 10  | Pending        |                         |
    AutoDoorToggleCallPacket,               // ID 11  | Confirmed      |                         |
    BeginBreakCallPacket,                   // ID 12  | Confirmed      |                         |
    BeginPlaceCallPacket,                   // ID 13  | Confirmed      |                         |
    BlockSnapshotCallPacket,                // ID 14  | Pending        |                         |
    BuildDestroyedCallPacket,               // ID 15  | Pending        |                         |
    BuildHealthUpdateCallPacket,            // ID 16  | Pending        |                         |
    BuildingControlSelectCallPacket,        // ID 17  | Pending        |                         |
    ClearItemsCallPacket,                   // ID 18  | Pending        |                         |
    ClearLiquidsCallPacket,                 // ID 19  | Pending        |                         |
    ClearObjectivesCallPacket,              // ID 20  | Pending        |                         |
    ClientBinaryPacketReliableCallPacket,   // ID 21  |                |                         |
    ClientBinaryPacketUnreliableCallPacket, // ID 22  |                |                         |
    ClientLogicDataReliableCallPacket,      // ID 23  |                |                         |
    ClientLogicDataUnreliableCallPacket,    // ID 24  |                |                         |
    ClientPacketReliableCallPacket,         // ID 25  |                |                         |
    ClientPacketUnreliableCallPacket,       // ID 26  |                |                         |
    ClientPlanSnapshotCallPacket,           // ID 27  | Untested       |                         |
    ClientPlanSnapshotReceivedCallPacket,   // ID 28  | Pending        |                         |
    ClientSnapshotCallPacket,               // ID 29  | Mostly Working |                         |
    CommandBuildingCallPacket,              // ID 30  | Pending        |                         |
    CommandUnitsCallPacket,                 // ID 31  | Pending        |                         |
    CompleteObjectiveCallPacket,            // ID 32  | Pending        |                         |
    ConnectCallPacket,                      // ID 33  | I think?       |                         |
    ConnectConfirmCallPacket,               // ID 34  | Confirmed      |                         |
    ConstructFinishCallPacket,              // ID 35  | Confirmed      |                         |
    CopyToClipboardCallPacket,              // ID 36  | Pending        |                         |
    CreateBulletCallPacket,                 // ID 37  | Pending        |                         |
    CreateMarkerCallPacket,                 // ID 38  |                |                         |
    CreateWeatherCallPacket,                // ID 39  | Pending        |                         |
    DebugStatusClientCallPacket,            // ID 40  | Pending        |                         |
    DebugStatusClientUnreliableCallPacket,  // ID 41  | Pending        |                         |
    DeconstructFinishCallPacket,            // ID 42  | Confirmed      |                         |
    DeletePlansCallPacket,                  // ID 43  | Pending        |                         |
    DestroyPayloadCallPacket,               // ID 44  | Pending        |                         |
    DropItemCallPacket,                     // ID 45  | Confirmed      |                         |
    EffectCallPacket,                       // ID 46  |                |                         |
    EffectCallPacket2,                      // ID 47  |                |                         |
    EffectReliableCallPacket,               // ID 48  | Pending        |                         |
    EntitySnapshotCallPacket,               // ID 49  | Handler broken |                         |
  //FillTileBlocksCallPacket                // ID 50  |                |                         |
  //FillTileFloorsCallPacket                // ID 51  |                |                         |
  //FillTileOverlaysCallPacket              // ID 52  |                |                         |
  //FollowUpMenuCallPacket                  // ID 53  |                |                         |
    GameOverCallPacket,                     // ID 54  | Pending        |                         |
  //HiddenSnapshotCallPacket                // ID 55
  //HideFollowUpMenuCallPacket              // ID 56  |                |                         |
    HideHudTextCallPacket,                  // ID 57  | Blank packet   |                         |
  //HideMenuBuilderCallPacket               // ID 58  |                |                         |
    InfoMessageCallPacket,                  // ID 59  | Confirmed      | Update ID               |
    InfoPopupCallPacket,                    // ID 60  | Confirmed      | Update ID               |
    InfoPopupCallPacket2,                   // ID 61  | Pending        | Update ID               |
    InfoPopupReliableCallPacket,            // ID 62  | Pending        | Update ID               |
    InfoPopupReliableCallPacket2,           // ID 63  | Pending        | Update ID               |
    InfoToastCallPacket,                    // ID 64  | Pending        | Update ID               |
    KickCallPacket,                         // ID 65  | Confirmed      | Update ID               |
    KickCallPacket2,                        // ID 66  | Pending        | Update ID               |

    LandingPadLandedCallPacket,             // ID 73  | Pending        | Update ID               |
    LogicExplosionCallPacket,               // ID 74  | Pending        | Update ID               |

    OpenURICallPacket,                      // ID 80  | Confirmed      | Update ID               |
    PayloadDroppedCallPacket,               // ID 81  | Pending        | Update ID               |
    PickedBuildPayloadCallPacket,           // ID 82  | Pending        | Update ID               |
    PickedUnitPayloadCallPacket,            // ID 83  | Pending        | Update ID               |
    PingCallPacket,                         // ID 84  | Confirmed      | Update ID               |
    PingLocationCallPacket,                 // ID 85  | Confirmed      | Update ID               |
    PingResponseCallPacket,                 // ID 86  | Confirmed      | Update ID               |
    PlayMusicCallPacket,                    // ID 87  | Confirmed      | Update ID               |
    PlayerDisconnectCallPacket,             // ID 88  | Confirmed      | Update ID               |
    PlayerSpawnCallPacket,                  // ID 89  | Mostly         | Update ID               |

    RequestAssetsCallPacket,                // ID 90  | Pending        | Update ID               |

    RequestBuildPayloadCallPacket,          // ID 96  | Pending        | Update ID               |

    RequestDropPayloadCallPacket,           // ID 98  | Pending        | Update ID               |
    RequestItemCallPacket,                  // ID 99  | Pending        | Update ID               |
    RequestUnitPayloadCallPacket,           // ID 100 | Pending        | Update ID               |
    RequestWorldCallPacket,                 // ID 101 | Pending        | Update ID               |

    RotateBlockCallPacket,                  // ID 103 | Confirmed      | Update ID               |
    SectorCaptureCallPacket,                // ID 104 | Blank Packet   | Update ID               |
    SendChatMessageCallPacket,              // ID 105 | Confirmed      | Update ID               |
    SendMessageCallPacket,                  // ID 106 | Confirmed      | Update ID               |
    SendMessageCallPacket2,                 // ID 107 | Confirmed      | Update ID               |

    SetFlagCallPacket,                      // ID 113 | Pending        | Update ID               |
    SetFloorCallPacket,                     // ID 114 | Pending        | Update ID               |

    SetItemsCallPacket,                     // ID 118 | Pending        | Update ID               |

    SetMapAreaCallPacket,                   // ID 121 | Pending        | Update ID               |

    SetOverlayCallPacket,                   // ID 123 | Pending        | Update ID               |

    SetPositionCallPacket,                  // ID 125 | Pending        | Update ID               |
    SetRuleCallPacket,                      // ID 126 | Pending        | Update ID               |
    SetRulesCallPacket,                     // ID 127 |                | Update ID               |
    SetTeamCallPacket,                      // ID 128 | Pending        | Update ID               |
    SetTeamsCallPacket,                     // ID 129 | Pending        | Update ID               |
    SetTileCallPacket,                      // ID 130 | Pending        | Update ID               |

    SetUnitCommandCallPacket,               // ID 136 |                | Update ID               |
    SetUnitStanceCallPacket,                // ID 137 | Pending        | Update ID               |

    SpawnEffectCallPacket,                  // ID 140 | Pending        | Update ID               |
    StateSnapshotCallPacket,                // ID 141 | Pending        | Update ID               |
    SyncVariableCallPacket,                 // ID 142 |                | Update ID               |
    TakeItemsCallPacket,                    // ID 143 | Pending        | Update ID               |

    TileConfigCallPacket,                   // ID 147 | Broken         | Update ID               |
    TileTapCallPacket,                      // ID 148 | Confirmed      | Update ID               |

    TransferInventoryCallPacket,            // ID 150 | Pending        | Update ID               |

    TransferItemToCallPacket,               // ID 152 | Fix later      | Update ID               |

    UnitBlockSpawnCallPacket,               // ID 154 |                | Update ID               |
    UnitBuildingControlSelectCallPacket,    // ID 155 | Pending        | Update ID               |

    UnitClearCallPacket,                    // ID 157 | Pending        | Update ID               |
    UnitControlCallPacket,                  // ID 158 | Pending        | Update ID               |
    UnitDeathCallPacket,                    // ID 159 | Pending        | Update ID               |
    UnitDespawnCallPacket,                  // ID 160 | Pending        | Update ID               |
    UnitDestroyCallPacket,                  // ID 161 | Pending        | Update ID               |
    UnitEnteredPayloadCallPacket,           // ID 162 |                | Update ID               |

    UnitSpawnCallPacket,                    // ID 165 |                | Update ID               |

    UpdateGameOverCallPacket,               // ID 167 | Confirmed      | Update ID               |

    WarningToastCallPacket,                 // ID 171 | Confirmed      | Update ID               |
    WorldDataBeginCallPacket,               // ID 172 | Blank packet   | Update ID               |

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