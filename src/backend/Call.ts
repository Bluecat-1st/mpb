import type { Mindustry, NetClient } from "./client.js";
import { packets as Packets } from "./Packets.js";
import type { nullableString, float } from "./primitives.js";

export enum Send {
    unreliabale = 0,
    reliabale = 1,
}

export class Call {
    #game;
    constructor(game:Mindustry) {
        this.#game = game;
    }
    /** @alias {@link NetClient.send} */
    protected send(packet:InstanceType<typeof Packets.Packet>,reliabale:Send.reliabale|Send.unreliabale){
        this.#game.netClient!.send(packet,reliabale);
    }
    // ID 77
    /** You will need to multiply by `8` to convert to a tile location */
    pingLocation(x:float,y:float,text?:nullableString){
        const packet = new Packets.PingLocationCallPacket();
        packet.x = x;
        packet.y = y;
        packet.text = text ?? null;
        this.send(packet, Send.reliabale);
    }
    // ID 97
    sendChatMessage(message:string) {
        const packet = new Packets.SendChatMessageCallPacket();
        packet.message = message;
        this.send(packet, Send.reliabale);
    }
}