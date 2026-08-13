import { jsonrepair } from "jsonrepair";

export class JsonIO{
	static fromString(str:string):object{
		str = str.replace("io.anuke.", "")
		let json;
		try{
			json = JSON.parse(jsonrepair(str))
		} catch(e){}
		return json
	}
}