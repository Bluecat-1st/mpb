import type { Mindustry } from "./client.js";
import type { packets as Packets } from './Packets.js';
import type { float, int, nullableShort, nullableString, short } from "./primitives.js";
import { say, throwError, warn } from "./textFormater.js";

export class Utils{
	mindustry;
	constructor(mindustry:Mindustry){
		this.mindustry = mindustry;
	}
	/**
	 * Get the content from it's ID.
	 * @param contentType - The content type to get from.
	 * @param contentID - The content ID.
	 * @deprecated This is prone to failling, use the safer version from a instace of {@link Utils}.
	 */
	static getContentByID(contentType:string,contentID:nullableShort):nullableString{
		if (!global.contentMap) throwError(`Content map is not initalized!`);
		const map = global.contentMap[contentType];
		if (!map) throwError(`Content type [acid][italic]${contentType}[reset] does not exit on the content map!`);
		if (contentID === null) return null;
		const content = map[contentID];
		if (!content) return null;
		return content;
	}
	getContentByID(contentType:string,contentID:nullableShort):nullableString{
		if (!this.mindustry.netClient?.player) return null;
		if (!global.contentMap) throwError(`Content map is not initalized!`);
		const map = global.contentMap[contentType];
		if (!map) throwError(`Content type [acid][italic]${contentType}[reset] does not exit on the content map!`);
		if (contentID === null) return null;
		const content = map[contentID];
		if (!content) return null;
		return content;
	}
	static getContentID(contentType:string,contentName:nullableString):nullableShort{
		if (!global.contentMap) throwError(`Content map is not initalized!`);
		const map = global.contentMap[contentType];
		if (!map) throwError(`Content type [acid][italic]${contentType}[reset] does not exit on the content map!`);
		if (contentName === null) return null;
		const contentID = map.indexOf(contentName) as short;
		return contentID === -1 ? null : contentID;
	}
	static getBlockByName(block:string){
		return Utils.getContentID('block',block);
	}
	static getItemByName(item:string){
		return Utils.getContentID('item',item);
	}
	static getUnitByName(unit:string){
		return Utils.getContentID('unit',unit);
	}
	static escapeColors(str:string){
		const colors = [
	        "white", "lightGray", "gray", "darkGray", "black", "clear",
	        "blue", "navy", "royal", "slate", "sky", "cyan", "teal",
	        "green", "acid", "lime", "forest", "olive", "yellow", "gold",
	        "goldenrod", "orange", "brown", "tan", "brick", "red", "scarlet",
	        "crimson", "coral", "salmon", "pink", "magenta", "purple", "violet", "maroon"
	    ];

	    const pattern = new RegExp(
	        `\\[(${colors.join('|')}|#[0-9A-Fa-f]{6})\\]`, 'g'
	    );

	    return str.replace(pattern, '');
	}
	static escapeGlyphs(input:string) {
	    const start = 63083;
	    const end = 63743;

	    return Array.from(input)
	        .filter(char => {
	            const code = char.codePointAt(0)!;
	            return code < start || code > end;
	        })
	        .join('');
	}
	// Custom Utills
	static chatMsgFromSelf(packet:InstanceType<typeof Packets.SendMessageCallPacket2>,self:Mindustry):boolean{
		if (!self.netClient?.player?.id){
			warn('The bot does not have an player ID!');
			return false;
		}
		return packet.playersender === self.netClient.player.id;
	}
	/** Converts a `float` position into a intiger tile position */
	static toTilePos(x:float,y:float,p?:null):{x:int,y:int};
	/** Converts a `float` position into a string representation with the precision given */
	static toTilePos(x:float,y:float,p:number):`(${number},${number})`;
	static toTilePos(x:float,y:float,p:number|null = null){
		if (p === null){
			return {
				x:Math.floor(x/8),
				y:Math.floor(y/8)
			}
		}else{
			return `(${(x/8).toFixed(p)},${(y/8).toFixed(p)})`
		}
	}
	/** Converts a `float` position into a intiger tile position */
	toTilePos(x:float,y:float,p?:null):{x:int,y:int};
	/** Converts a `float` position into a string representation with the precision given */
	toTilePos(x:float,y:float,p:number):`(${number},${number})`;
	toTilePos(x:float,y:float,p:number|null = null){
		return Utils.toTilePos(x,y,p as any) as any;
	}
}

export function formatValue(v:unknown):string{
	switch(typeof v){
		case "string":return `[yellow]${v}[reset]`;
		case "number":return `[acid]${v}[reset]`;
		case "bigint":return `[acid]${v}[reset]`;
		case "boolean":return v?'[green][bold]True[reset]':'[red][bold]False[reset]';
		case "symbol":return `[blue]Symbol: ${v.toString()}[reset]`;
		case "undefined":return `[orange]Undefined[reset]`;
		case "object":{
			if (v === null){
				return `[Orange]Null[reset]`;
			}else{
				if ('toString' in v){
					return `[blue]Object: ${v.toString()}[reset]`;
				}else{
					return `[blue]Object[reset]`;
				}
			}
		}
		case "function":return `[blue]Function(){...}[reset]`;
		default:return `[red][Imposible Error: Unknown value type ${typeof v}][reset]`;
	}
}

export function readObjectFancy(object:object,prefix:string|null = null){
	for (const [key, value] of Object.entries(object) as [string, unknown][]){
		const pre = `${prefix ? `${prefix}.`:''}[acid][italic]${key}[reset]`;
		const start = `${pre} = `;
		if (typeof value === 'object'){
			if (Array.isArray(value)){
				say(`${start}[blue]Array[Len:${value.length}]`);
			}else{
				if (value === null){
					say(`${start}${formatValue(value)}`);
					continue;
				}
				readObjectFancy(value,pre);
			}
		}else{
			say(`${start}${formatValue(value)}`);
		}
	}
}