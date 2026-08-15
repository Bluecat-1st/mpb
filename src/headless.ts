import type { packets as Packets } from "./backend/Packets.js";
import type { float } from "./backend/primitives.js";
import { throwError, say, warn } from "./backend/textFormater.js";
import { readObjectFancy, Utils } from "./backend/Utills.js";
import { pingHost } from "./backend/PingHost.js";
import { Mindustry } from "./backend/client.js";
import { config } from "./backend/botConfig.js";

const client = new Mindustry();
client.createClient();
if (!client.netClient) {
    throwError('client.netClient was not created!');
}
client.netClient.on("connect", () => {
    if (!client.netClient) {
        throwError('client.netClient has gone missing!');
    }
    say('Joining...');
    client.netClient.join("mpb (Bot)", "UUIDAAAAAAA=", "USIDAAAAAAA=");
    say('Confirming connection...');
    client.netClient.connectConfirm();
});
client.netClient.on("SendMessageCallPacket2", (p: InstanceType<typeof Packets.SendMessageCallPacket2>) => {
    if (client.netClient?.player?.admin){
        client.call.sendChatMessage(`[#f00]Error: This bot should NOT be an admin!`);
        throwError(`This bot should NOT be an admin!`);
    }
    if (Utils.chatMsgFromSelf(p, client)) {
        say(`Message from self: [white]${p.unformatted}`);
        return;
    }
    say(`Message from chat:'[white]${p.unformatted}[reset]' from user [blue]${p.playersender}`);
    if (!p.unformatted) {
        warn(`Empty message! (Safeguard 1)`);
        return;
    }
    if (config.whitelistGliphFiltering){
        p.unformatted = p.unformatted.split('').filter((char)=>'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890`-=[]\\;\',./~!@#$%^&*()_+{}|:"<>? '.includes(char)).join('');
    }
    if (config.escapeMessageFormating){
        p.unformatted = Utils.escapeGlyphs(Utils.escapeColors(p.unformatted));
    }
    say(`Excaped text: ${p.unformatted}`);
    if (p.playersender === -1){
        client.call.sendChatMessage(`Message from user [blue]-1[]: ${p.unformatted}`);
    }
    setTimeout(() => {
        if (!p.unformatted) {
            warn(`Empty message! (Safeguard 2)`);
            return;
        }
        if (!client.netClient) {
            throwError('client.netClient does not exist!');
        }
        if(p.unformatted === 'mpb ping') {
            client.netClient.ping(true).then((ping) => {
                if (!client.netClient) {
                    throwError('client.netClient does not exist!');
                }
                if (ping) {
                    client.call.sendChatMessage(`Ping: ${ping}ms`);
                    say(`Ping was requested and returned at [green]${ping}[reset]ms.`);
                } else {
                    // First of all, how? Might as well play safe:
                    try {
                        client.call.sendChatMessage(`Ping check timed out!`);
                    } catch (err) {
                        console.error(err);
                    }
                    warn(`Ping was requested but timed out!`);
                }
            });
        }else if (p.unformatted.trim().startsWith('mpb moveto ')) {
            const args = p.unformatted!.slice('mpb moveto '.length).split(' ');
            if (args.length !== 2) {
                //warn(`Warning: Command moveto needed two numbers afterwards as arguments.`);
                client.call.sendChatMessage(`[yellow]Warning: Command moveto needed two numbers afterwards as arguments.`);
            } else {
                if (!args[0] || !args[1]) return;
                const x = parseInt(args[0]);
                const y = parseInt(args[1]);
                if (x < 0 || y < 0 || isNaN(x) || isNaN(y)) {
                    //warn(`Warning: Command moveto needs two VALID numbers afterwards as arguments.`);
                    client.call.sendChatMessage(`[yellow]Warning: Command moveto needs two [red]VALID[yellow] numbers afterwards as arguments.`);
                } else {
                    //say(`Moving to [yellow](${x},${y})`);
                    client.call.sendChatMessage(`Moving to [yellow](${x},${y})[white].`);
                    client.netClient.player?.controller.moveTo(<float>x,<float>y,8,1);
                }
            }
        }else if (p.unformatted === 'mpb info') {
            let info = `MPB's status:\n`;
            if (client.netClient.player) {
                info += `Pos:[yellow](${client.netClient.player.unit.position?.x},${client.netClient.player.unit.position?.y})\n`;
            } else {
                info += `Pos: [red]Error: No player unit[]`;
            }
            info += `\nloadWorldAttempted: ${client.netClient.loadWorldAttemped}\nloadWorldFinished: ${client.netClient.loadWorldFinished}`
            say(info);
            client.call.sendChatMessage(info.replaceAll('\n', ' '));
        }else if (p.unformatted === 'mpb units') {
            console.log(Object.keys(client.netClient.units as object).join(', '));
            client.call.sendChatMessage(Object.keys(client.netClient.units as object).join(', '));
        }else if (p.unformatted === 'mpb disconnect') {
            client.call.sendChatMessage('Disconnecting...');
            say(`Disconnecting...`);
            client.netClient.reset();
        }else if (p.unformatted.startsWith(`mpb say `)) {
            const arg = p.unformatted!.slice('mpb say '.length).trim();
            warn(arg);
            const text = `(By [blue]${p.playersender ?? 'unknown sender'}[white]) ${arg}`;
            client.call.sendChatMessage(text ?? `[red]Error`);
        }else if (p.unformatted === 'mpb respawn'){
            client.netClient.player?.respawn();
        }else if (p.unformatted.startsWith('mpb setPlayerVar ')){
            const args = p.unformatted!.slice('mpb setPlayerVar '.length).split(' ') as [string, string];
            if (args.length !== 2) {
                const msg = `Warning: Command setPlayerVar needs two arguments.`
                warn(msg);
                client.call.sendChatMessage(`[yellow]${msg}`);
                return;
            }
            const controller = client.netClient.player?.controller;
            if (!controller){
                const err = `[red]Critical error: client.netClient.player.controller does not exist!`;
                say(`[bold]${err}`);
                client.call.sendChatMessage(err);
                return;
            }
            const param = (controller as any as Record<string, unknown>)[args[0]];
            if (!(args[0] in (controller as any as Record<string, unknown>))){
                const err = `[white]${args[0]}[yellow] does not exist on client.netClient.player.controller`;
                say(err);
                client.call.sendChatMessage(err);
                return;
            }
            switch(typeof param){
                case "string":{
                    (controller as any as Record<string, unknown>)[args[0]] = param[1];
                    break;
                }
                case "number":{
                    const num = Number.parseFloat(args[1]);
                    if ((!num && num!==0) || Number.isNaN(num)){
                        const err = `[red]Unable to parse number [white]${args[1]}[red].`;
                        say(err);
                        client.call.sendChatMessage(err);
                        return;
                    }
                    (controller as any as Record<string, unknown>)[args[0]] = num;
                    break;
                }
                case "boolean":{
                    const bool = args[1].toLowerCase();
                    if (bool === 'true'){
                        (controller as any as Record<string, unknown>)[args[0]] = true;
                    }else if (bool === 'false'){
                        (controller as any as Record<string, unknown>)[args[0]] = false;
                    }else{
                        const err = `[red]Invalid boolian [white]${bool}[red].`;
                        say(err);
                        client.call.sendChatMessage(err);
                        return;
                    }
                    break;
                }
                case "bigint":
                case "symbol":
                case "undefined":
                case "function":{
                    const err = `[yellow]Param [white]${args[0]}[yellow] is of disallowed type [acid]${typeof param}[yellow].`;
                    say(err);
                    client.call.sendChatMessage(err);
                    return;
                }
                case "object":{
                    const err = `[yellow]Param [white]${args[0]}[yellow] is of disallowed type [acid]${param === null ? 'null':'object'}[yellow].`;
                    say(err);
                    client.call.sendChatMessage(err);
                    return;
                }
            }
        }else if (p.unformatted.startsWith('mpb assist ')){
            const arg = p.unformatted!.slice('mpb assist '.length).trim();
            client.netClient.player?.controller.assist(arg);
        }else if (p.unformatted === `mpb printUnitID`){
            if (client.netClient.player?.id){
                client.call.sendChatMessage(`MPB's player ID is [acid]${client.netClient.player.id}`);
            }else{
                client.call.sendChatMessage(`[#f00]ERROR: MPB does not have a player ID, check [gray]netClient.loadWorld()[]!`);
            }
        }else if (p.unformatted.startsWith('mpb pingPos ')){
            const args = p.unformatted!.slice('mpb pingPos '.length).split(' ');
            if (args.length < 2){
                client.call.sendChatMessage(`[yellow]Warning: Command pingPos needs a [acid]x[] and [acid]y[] position and optionally text to add to the ping!`);
                return;
            }
            if (!args[0] || !args[1]) return;
            const x = 8*Number.parseFloat(args[0]) as float;
            const y = 8*Number.parseFloat(args[1]) as float;
            if (x < 0 || y < 0 || isNaN(x) || isNaN(y)) {
                client.call.sendChatMessage(`[yellow]Warning: Command pingPos needs two [#f00]valid[] numbers for the ping position!`);
                return;
            }
            if (args.length > 2){
                client.call.pingLocation(x,y,args.slice(2).join(' '));
            }else{
                client.call.pingLocation(x,y);
            }
            client.call.sendChatMessage(`Pinged location.`);
        }
    }, Math.floor(Math.random() * 1000));
});

pingHost(config.server.port, config.server.ip, (data, err) => {
    if (err) {
        throw err;
    } else {
        if (!data) throwError(`[yellow]pingHost[reset][red][bold] did not throw an error but it didn't return data on the server!`);
        say(`Server data:`);
        readObjectFancy(data);
        say(`-`.repeat(10));
        if (data.version > config.version) {
            throwError(`The bot is outdated! (V${data.version} > V${config.version})`);
        } else if (data.version < config.version) {
            throwError(`The server is outdated! (V${data.version} < V${config.version})`);
        }
        say(`Begenning connection...`);
        if (!client.netClient) {
            throwError('client.netClient has gone missing!');
        }
        client.netClient.connect(data.port, data.ip);
    }
});
