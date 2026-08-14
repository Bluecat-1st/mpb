global.contentMap = {};
import { EventEmitter } from "node:events";
import { TCPConnection, UDPConnection } from "./net.js";
import { PacketSerializer } from "./PacketSerializer.js";
import { FrameworkMessage } from "./net.js";
import { namePacket, Packet, packets as Packets, StreamBuilder} from "./Packets.js";
import { DataStream } from "./DataStream.js";
import { JsonIO } from "./JsonIO.js";
import { SaveIO } from "./SaveIO.js";
import { TypeIO, type Plan } from "./TypeIO.js";
import { BlockIO } from "./BlockIO.js";
import { UnitIO } from "./UnitIO.js";
import { Player } from "./Player.js";
import { inflate } from "pako";
import contentTypesData from './json/ContentTypes.json' with { type: 'json' };
const contentTypes = contentTypesData.contentTypes;
if (!contentTypes || !Array.isArray(contentTypes)) {
    throw new Error('json/ContentTypes.json.contentTypes must be an array of strings.');
}
import { Call, Send } from "./Call.js";
import { World } from "./World.js";
import { Utils } from "./Utills.js";
import { formatText, say, throwError, warn } from './textFormater.js';
import { byte, type nullableString, type float, type int, type long, type short } from "./primitives.js";
import { Logger } from "./logger.js";

export interface Unit {
    position?:{
        x:float;
        y:float;
    }
    vel?:{
        x:float;
        y:float;
    }
    utype?:number;
    unit?:int;
    plans?:Plan[];
    name?:string;
    viewX?:float;
    viewY?:float;
    viewWidth?:float;
    viewHeight?:float;
    type?:byte;
    revis?:short;
    selectedBlock?:nullableString;
    miningpos?:{x:number,y:number};
    [x:string]:any;
}

export class Client {
    #TCPRegistered = false;
    #UDPRegistered = false;
    #tcp;
    #udp;
    #event;
    #parser;
    constructor(w: number, s: PacketSerializer, p: (data: Packet) => void) {
        this.#tcp = new TCPConnection(w, s, data => { this.parse(data); });
        this.#udp = new UDPConnection(w, s, data => { this.parse(data); });
        this.#event = new EventEmitter();
        this.#tcp.on("timeout", () => {
            this.#event.emit("timeout");
        });
        this.#tcp.on("error", e => {
            this.#event.emit("error", e);
        });
        this.#tcp.on("close", () => {
            this.#event.emit("disconnect");
        });
        this.#parser = p;
    }
    on(name:string, func: (...args: any[]) => void) {
        this.#event.on(name, func);
    }
    once(name:string, func: (...args: any[]) => void) {
        this.#event.once(name, func);
    }
    /** Connects a TCP and a UDP connection to a location */
    connect(port:number, ip:string) {
        this.#tcp.connect(port, ip);
        this.#udp.connect(port, ip);
        setTimeout(() => {
            if (!this.#UDPRegistered) {
                this.close();
            }
        }, 10000);
    }
    /** Sends data over the TCP connection */
    sendTCP(obj:Parameters<TCPConnection['send']>[0]) {
        return this.#tcp.send(obj)
    }
    /** Sends data over the UDP connection */
    sendUDP(obj:Parameters<UDPConnection['send']>[0]) {
        return this.#udp.send(obj)
    }
    /** Close the TCP and UDP connections. */
    close() {
        this.#tcp.close();
        this.#udp.close();
        this.#TCPRegistered = false;
        this.#UDPRegistered = false;
    }
    /** Get if the TCP and UDP connections are registered */
    connected() {
        return this.#TCPRegistered && this.#UDPRegistered
    }
    parse(packet?:ReturnType<TCPConnection['readObject']>) {
        if (packet) {
            if (!this.#TCPRegistered) {
                if (packet instanceof FrameworkMessage.RegisterTCP) {
                    this.#TCPRegistered = true;
                    let p = new FrameworkMessage.RegisterUDP();
                    p.connectionID = packet.connectionID;
                    this.sendUDP(p);
                }
            }
            if (!this.#UDPRegistered) {
                if (packet instanceof FrameworkMessage.RegisterUDP) {
                    this.#UDPRegistered = true;
                    this.#event.emit("connect");
                }
            }
            if (!(packet instanceof FrameworkMessage)) {
                this.#parser(packet)
            }
        }
    }
}
class Events {
    #em;
    constructor() {
        this.#em = new EventEmitter();
        this.#em.setMaxListeners(Infinity)
    }
    on(a:string, b:(...args: any[]) => void) {
        this.#em.on(a, b);
    }
    fire(a:string, b?:(...args: any[]) => void) {
        this.#em.emit(a, b);
    }
}
export class Mindustry {
    netClient: NetClient | undefined;
    call:Call;
    rules:{};
    world:World;
    events:Events;
    utils:Utils;
    
    constructor() {
        this.rules = {};
        this.world = new World();
        this.call = new Call(this);
        this.events = new Events();
        this.utils = Utils;
        TypeIO.setup(this.world);
    }
    createClient() {
        this.netClient = new NetClient(this);
    }
}

export class NetClient extends EventEmitter {
    #client;
    streams;
    game;
    units:Record<number,Unit>|undefined;
    player:Player|undefined;
    state:{
        waveTime:float,
        wave:int,
        enemies:int,
        paused:boolean,
        gameOver:boolean,
        timeData:int,
        tps:byte,
        rand0:long,
        rand1:long,
        teams:Record<number,Record<number, number>>
        coreData:Buffer
    };
    config:{
        autoReconnect?:boolean;
        lang?:string;
        client?:string;
        mods?:any[];
        /** The time between client snapshots */
        csTime?:number;
        disablePhysic?:boolean;
    }|undefined;
    port:number|undefined;
    ip:string|undefined;
    loadWorldAttemped = false;
    loadWorldFinished = false;
    constructor(game: Mindustry) {
        super();
        this.#client = new Client(8192, new PacketSerializer(), p => this.handleClientReceived(p));
        this.#client.on("timeout", () => {
            console.log("timeout!");
            this.reset();
            this.emit("timeout")
        });
        this.#client.on("error", e => {
            this.reset();
            if ('code' in e && e.code === 'EPIPE'){
                e = new Error(formatText('[red][bold]This bot [yellow]may[red] have been dos-banned.'));
            }
            console.error(e.stack);
            this.emit("error", e);
        });
        this.#client.on("connect", () => {
            console.log("connected!");
            this.emit("connect")
        });
        this.#client.on("disconnect", () => {
            console.log("disconnected!");
            if(this.config && this.config.autoReconnect){
                this.connect(this.port||6467, this.ip||'localhost', this.config);
            }
            this.reset();
            this.emit("disconnect");
        });
        this.game = game;
        this.state = {
            waveTime: -1 as float,
            wave: -1 as int,
            enemies: -1 as int,
            paused: true,
            gameOver: false,
            timeData: -1 as int,
            tps: -1 as byte,
            rand0: -1 as long,
            rand1: -1 as long,
            teams:{},
            coreData:new DataStream(0)._getBuffer()
        };
        this.streams = new Map<number,StreamBuilder>();
    }
    /** Began a connection to a server */
    connect(port:number, ip:string, config = {}) {
        this.#client.connect(port, ip);
        this.port = port;
        this.ip = ip;
        this.config = config;
    }
    /** Send data to a server */
    send(packet:Parameters<Client['sendTCP']>[0], reliabale:boolean|Send.reliabale|Send.unreliabale) {
        if (reliabale) {
            this.#client.sendTCP(packet);
        } else {
            this.#client.sendUDP(packet);
        }
    }
    reset() {
        this.#client.close();
        this.player && this.player.stop();
    }
    /** Send a connect packet to the server with player data */
    join(name:string, uuid:string, usid:string) {
        let p = new Packets.ConnectPacket();
        p.name = name;
        p.uuid = uuid ?? "AAAAAAAAAAA=";
        p.usid = usid ?? "AAAAAAAAAAA=";
        p.lang = this.config?.lang ?? "en";
        p.client = this.config?.client ?? "official";
        p.mods = this.config?.mods ?? [];
        this.send(p, true);
    }
    /** 
     * Send a message to chat
     * @deprecated I want to move calls to this to be moved as there is no point having this alias here.
     * @alias {@link Call.sendChatMessage}
     */
    sendChatMessage(msg:string) {
        this.game.call.sendChatMessage(msg);
    }
    /** Confirm the join */
    connectConfirm() {
        this.send(new Packets.ConnectConfirmCallPacket(), true)
        this.units = {};
    }
    /** Get if the client is connected */
    client() {
        return this.#client.connected();
    }
    async ping(measureLatency = false) {
        let p = new Packets.PingCallPacket();
        const startTime = Date.now();

        p.time = startTime as long;

        this.send(p, true);

        const pingPromise = new Promise<number>((resolve) => {
            this.once("PingResponseCallPacket", (value:InstanceType<typeof Packets.PingResponseCallPacket>) => {
                if (measureLatency) {
                    const endTime = Date.now();
                    const latency = endTime - startTime;
                    resolve(latency);
                } else {
                    resolve(value.time!);
                }
            });
        });

        const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
                resolve(null);
            }, 10000);
        });

        return Promise.race([pingPromise, timeoutPromise]);
    }
    handleClientReceived(packet:Packet) {
        try {
            packet.handled(this);
            if (packet instanceof Packets.StreamBegin) {
                this.streams.set(packet.id, new StreamBuilder(packet));
            } else if (packet instanceof Packets.StreamChunk) {
                let builder = this.streams.get(packet.id!);
                if (builder) {
                    let buf = packet.data!;
                    builder.add(Buffer.from(buf));
                    //console.log(builder.length + "/" + builder.total + " " + Math.floor(builder.length / builder.total * 100) + "%");
                    if (builder.isDone()) {
                        say(`Received world data: [acid]${builder.total}[reset] bytes.`);
                        this.streams.delete(builder.id);
                        this.handleClientReceived(builder.build())
                    }
                } else {
                    console.error("Received stream chunk without a StreamBegin beforehand!");
                }
            } else {
                super.emit("*", packet.constructor.name, packet);
                super.emit(packet.constructor.name, packet);
                packet.handleClient(this);
            }
        } catch (e) {
            console.error(e);
            if (e instanceof Error){
                Logger.log(`Error handleing packet ${namePacket(packet)}: ${e.stack ?? e.message}`, true);
            }else{
                Logger.log(`Error handleing packet ${namePacket(packet)}: ${e}`, true);
            }
            //throw e;
        }
    }
    loadWorld(packet:InstanceType<typeof Packets.WorldStream>) {
        this.loadWorldAttemped = true;
        say(`-`.repeat(10));
        say(`Loading World...`);
        let buf = DataStream.from(Buffer.from(inflate(packet._stream!)));
        buf.printStatus(`Initial creation`);
        SaveIO.readDataPatches(buf);
        buf.printStatus(`Read patches`);
        //let rules = JsonIO.fromString(TypeIO.readString(buf)!);
        let rules = JsonIO.fromString(buf.readString(true));
        this.game.rules = rules;
        buf.printStatus(`Read rules`);
        // Locals
        buf.readString();
        buf.printStatus(`Read locals`);
        let map = SaveIO.readStringMap(buf);
        this.game.world.map = map;
        buf.printStatus(`Read string map`);

        let wave = buf.getInt();
        let wavetime = buf.getFloat();
        let tick = buf.getDouble();
        let seed0 = buf.getLong();
        let seed1 = buf.getLong();

        let id = buf.getInt();
        try{
            if(this.player){
                this.player.stop()
                this.connectConfirm()
            }
            this.player = new Player(this, id);
        } catch (e) {
            say(`[red][bold]Error creating player.`);
            console.log(e);
            return;
        }
        buf.printStatus(`Map info & player ID`);

        this.game.events.fire("PlayerCreatedEvent");

        this.player.read(buf);

        buf.printStatus(`Read player`)

        console.log(`Loading content.`);
        const mapped = buf.get();
        const cmap:Record<string,string[]> = {}
        for (let i = 0; i < mapped; i++) {
            const type = buf.get();
            const total = buf.getShort();
            if (!contentTypes[type]){
                throwError(`Unknown content type: [acid]${type}[reset]`);
            }
            say(`Loading content type: ${contentTypes[type]}`);
            cmap[contentTypes[type]] = [];
            for (let j = 0; j < total; j++) {
                const str = buf.readString();
                //say(str);
                cmap[contentTypes[type]]!.push(str);
            }
        }
        buf.printStatus(`Read content`);

        global.contentMap = cmap;
        console.log(`Finished loading content.`);

        SaveIO.readMap(buf, this.game.world); // Known to fail. A WIP
        buf.printStatus(`Read map`);

        this.game.world.teamBlocks = SaveIO.readTeamBlocks(buf);
        buf.printStatus(`Read team blocks`);

        warn(`TODO: Finish reading map info`);

        this.game.events.fire("WorldLoadEvent");
        say(`Finished loading world`);
        say(`-`.repeat(10));
        this.loadWorldFinished = true;
    }
    updateUnitList(data:Record<number,Unit>){
        for (let key in data) {
            this.units![key] = data[key]!;
        }

        const maxLength = 2 ** 14;
        const entityRemoveTimeout = 1000 * 10;

        this.units = Object.fromEntries(
            Object.entries(this.units!).filter(
                ([id, unit]) => (Date.now() - unit.lastUpdate) <= entityRemoveTimeout
            )
        );

        if (Object.keys(this.units).length > maxLength) {
            const keysToRemove = Object.keys(this.units)
                .slice(0, Object.keys(this.units).length - maxLength);
            keysToRemove.forEach((key) => {
                console.log(`Removing unit [acid]${key}[reset].`);
                delete this.units![key as any];
            });
        }
    }
    entitySnapshot(amount:short, rawBuf:Buffer){
        let buf = DataStream.from(rawBuf);
        let ulist:Record<number,Unit> = {};
        try{
            for(let i = 0; i < amount; i++){
                let id = buf.getInt();
                let typeid = buf.get();
                
                continue;
                let unit = UnitIO.read(buf, typeid);

                unit.id = id;
                unit.lastUpdate = Date.now();
                ulist[id] = unit;
            }
            this.updateUnitList(ulist);
        } catch (e) {
            say(`[red][bold]Error parsing the entitySnapshot:`);
            //console.error(e);
            throw e;
        }
    }
    blockSnapshot(amount:short, rawBuf:Buffer) {
        const buf = DataStream.from(rawBuf);
        for(let i = 0; i < amount; i++){
            let pos = TypeIO.readTile(buf)!;
            let block = buf.getShort();
            let build;
            try{
                //build = BlockIO.readAll(buf, global.contentMap['block']![block]!, (blocksTypes as Record<string,string>)[global.contentMap['block']![block]!]!, byte(999));
            }catch(e){
                console.error('Error reading blockSnapshot:');
                console.error(e);
            }
            if (!build) continue;
            let tile = this.game.world.get(pos.x, pos.y)!;
            tile.setBuild(build);
        }
    }
    stateSnapshot(waveTime:float, wave:int, enemies:int, paused:boolean, gameOver:boolean, timeData:int, tps:byte, rand0:long, rand1:long, coreData:Buffer){
        let buf = DataStream.from(coreData);
        let teams = buf.get()
        let t:Record<number,Record<number,number>> = {}
        for(let i = 0; i < teams; i++){
            let team = buf.get();
            let items = BlockIO.readItemsM(buf, false);
            t[team] = items;
        }
        this.state = {
            waveTime,
            wave,
            enemies,
            paused,
            gameOver,
            timeData,
            tps,
            rand0,
            rand1,
            teams:t,
            coreData
        };
    }
}

