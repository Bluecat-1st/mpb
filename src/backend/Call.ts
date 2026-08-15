import type { Mindustry, NetClient } from "./client.js";
import { packets as Packets } from "./Packets.js";
import type { nullableString, float } from "./primitives.js";
import { say } from "./textFormater.js";

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
        if (text && text.length >= 40){
            text = text.slice(0,40-9)+`[gray]...`;
        }
        const packet = new Packets.PingLocationCallPacket();
        packet.x = x;
        packet.y = y;
        packet.text = text ?? null;
        this.send(packet, Send.reliabale);
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
        this.send(packet, Send.reliabale);
    }
}