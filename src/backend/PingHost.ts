// src/index.ts
import dgram from 'dgram';
import { DataStream } from './DataStream.js';
import { formatText, warn } from './textFormater.js';

type callback = (
    data:{
        name:string,
        map:string,
        players:number,
        wave:number,
        version:number,
        vertype:string,
        gamemode:number,
        limit:number,
        description:string,
        modeName:string,
        ip:string,
        port:number
    }|null,err?:Error)=>void;
export function pingHost(port:number, ip:string, callback:callback):void{
    let isDone = false;
    const timeoutId = setTimeout(() => {
        if (!isDone) {
            isDone = true;
            client.close();
            callback(null, new Error(formatText("[#ff0000]Timed out!")));
        }
    }, 2000);

    let client = dgram.createSocket('udp4',(msg,info)=>{
        if (isDone) return;
        isDone = true;
        clearTimeout(timeoutId);

        client.close();
        let readString = (buf:DataStream)=>{
            return buf.get(buf.get()).toString();
        };
        let bbuf = DataStream.from(msg);
        const data = {
            name: readString(bbuf),
            map: readString(bbuf),
            players: bbuf.getInt(),
            wave: bbuf.getInt(),
            version: bbuf.getInt(),
            vertype: readString(bbuf),
            gamemode: bbuf.get(),
            limit: bbuf.getInt(),
            description: readString(bbuf),
            modeName: readString(bbuf),
            ip: info.address,
            port: info.port
        };
        if (bbuf.hasRemaining()){
            warn(`Did not finish reading the server info responce by ${bbuf.remaining()} bytes`);
        }
        callback(data);
    });
    client.on('error', e => {
        if (isDone) return;
        isDone = true;
        clearTimeout(timeoutId);
        client.close();
        if ('code' in e && e.code === 'ECONNREFUSED'){
            callback(null, new Error(formatText(`[red][bold]Server requested is either offline or does not exist. (Address: [yellow]${ip}:${port}[red])`)));
        }else{
            callback(null, e);
        }
    });
    client.connect(port, ip, () => {
        client.send(Buffer.from([-2, 1]));
    });
}
