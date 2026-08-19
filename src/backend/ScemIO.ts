import { DataStream } from "./DataStream.js";
import { Utils } from "./Utills.js";
import { TypeIO, type Plan } from "./TypeIO.js";
import Pako from "pako";
import { byte, type int } from "./primitives.js";
import { throwError } from "./textFormater.js";

export class SchemeIO{
	static readBase64(str:string){
		let buf:any = Buffer.from(str, 'base64');
		buf = DataStream.from(buf);
		return this.read(buf);
	}
	static read(buf:DataStream){
		let header = 'msch';
		for(let i = 0; i < header.length; i++){
			let l = header[i];
			let s = String.fromCharCode(buf.get());
			if(l != s){
				throwError(`Expected header [acid]msch[red] instead [acid]${header}[red]!`);
			}
		}
		let ver = buf.get();

		let b = buf._getBuffer(buf.position());
		buf = DataStream.from(Buffer.from(Pako.inflate(b)));

		let width = buf.getShort();
		let height = buf.getShort();

		let tags = buf.get();

		let map:Record<string,string> = {};

		for(let i = 0; i < tags; i++){
			let key = buf.readString();
			let value = buf.readString();
			map[key] = value;
		}

		let blocks = [];
		let len = buf.get();
		for(let i = 0; i < len; i++){
			let name = buf.readString();
			//let bName = Utils.getBlockByName(name);
			//if (!bName) throwError(`Failed to get block name!`);
			blocks.push(name);
		}

		let total = buf.getInt();

		let res = [];
		
		for(let i = 0; i < total; i++){
			let block = blocks[buf.get()];
			if (!block) throwError(`Block can't be null!`);
			let position = TypeIO.readTile(buf);
			if (!position) throwError(`Position can't be null!`);
			let config = TypeIO.readObject(buf);
			let rotation = buf.get();;
			res.push({
				block,
				position,
				config,
				rotation
			})
		}

		return {
			map,
			res
		}
	}
	static toBuildPlans(sch:ReturnType<typeof SchemeIO.readBase64>['res'], x:number, y:number, rotation = 0) {
	    let plans:Plan[] = [];
	    
	    const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
	    let angle = angles[rotation % 4]!;
	    
	    for (let i = 0; i < sch.length; i++) {
	        let blk = sch[i]!;
	        let plan = {} as Plan;
	        
	        let originalX = blk.position.x;
	        let originalY = blk.position.y;
	        
	        let rotatedX = originalX * Math.cos(angle) - originalY * Math.sin(angle);
	        let rotatedY = originalX * Math.sin(angle) + originalY * Math.cos(angle);
	        
	        plan.position = {
	            x: <int>Math.round(x + rotatedX),
	            y: <int>Math.round(y + rotatedY)
	        };
	        
	        plan.breakPlan = false;
	        plan.block = blk.block;
	        
	        plan.rotation = ((blk.rotation + rotation) % 4) as byte;
	        
	        plan.hasConfig = true;
	        plan.config = blk.config;
	        
	        plans.push(plan);
	    }
	    return plans
	}
}