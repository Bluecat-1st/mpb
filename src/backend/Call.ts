import type { Mindustry, NetClient } from "./client.js";
import { packets as Packets } from "./Packets.js";
import type { nullableString, float, short } from "./primitives.js";
import { say } from "./textFormater.js";

export class Call {
    #game;
    constructor(game:Mindustry) {
        this.#game = game;
    }
    /** @alias {@link NetClient.send} */
    protected send(packet:InstanceType<typeof Packets.Packet>,reliabale:boolean){
        this.#game.netClient!.send(packet,reliabale);
    }
    // ID 77
    /** You will need to multiply by `8` to convert to a tile location */
    pingLocation(x:float,y:float,text?:nullableString){
        if (text && text.length >= 40){
            text = text.slice(0,40-9)+`[gray]...`;
        }
        const packet = new Packets.PingLocationCallPacket();
        packet.x = x;
        packet.y = y;
        packet.text = text ?? null;
        this.send(packet, true);
    }

    // ID 86
    requestAssets(ids:short[]){
        const packet = new Packets.RequestAssetsCallPacket();
        packet.ids = ids;
        this.send(packet, true);
    }

    // ID 93
    requestWorld(){
        const packet = new Packets.RequestWorldCallPacket();
        this.send(packet, true);
    }

    // ID 97
    /** Note: May cut off long chat messages and add a `...` at the end so longer messages can still get sent but be clear that they were cut off. */
    sendChatMessage(message:string) {
        if (message.length >= 150){
            message = message.slice(0,150-9)+`[gray]...`;
        }
        //say(`[Call.sendChatMessage]: ${message} [reset]| Len: ${message.length}`);
        const packet = new Packets.SendChatMessageCallPacket();
        packet.message = message;
        this.send(packet, true);
    }

    // ID 149
    unitClear(){
        const packet = new Packets.UnitClearCallPacket();
        this.send(packet, true);
    }
}