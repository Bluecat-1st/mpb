import { DataStream } from "./DataStream.js";
import { TypeIO } from "./TypeIO.js";
import { formatValue, readObjectFancy, Utils } from "./Utills.js";
import type { Unit } from "./client.js";
// mindustry.gen.EntityMapping.java
import unitTypes from './json/UnitTypes.json' with {type:'json'};
import type { byte, short } from "./primitives.js";
import { say, throwError } from "./textFormater.js";

export class UnitIO {
	static utils:Utils;
	static setup(utils:Utils){
		this.utils = utils;
	}
    static read(buf:DataStream, type:byte, rev?:boolean):Unit{
		//say(`[UnitIO.read] Unit type [acid][italic]${type}[]`);
		let revis;
		if(rev){
			revis = buf.getShort();
		}
		const utype = (unitTypes as Record<string,string>)[type];
		if (!utype) throwError(`Unknown unit type [acid]${type}[]!`);
		if (utype.startsWith(`NOPARSE_`)) throwError(`Unallowed entity to parse [italic][acid]${utype.slice(`NOPARSE_`.length)}[]!`);
		//const unit:Unit = this.readMain_old(buf, utype);
		const unit:Unit = this.readMain(buf, utype);
		unit.revis = revis!;
		unit.typeID = type;
		return unit;
	}
	/** @deprecated Switching to a new version that is easier to maintain. */
	static readMain_old(buf:DataStream, t:string){
		say(`[UnitIO.readMain_old] Unit type [italic][acid]${t}[]`);
		if (t == "MechUnit" || t == "CrawlUnit" || t == "ElevationMoveUnit" || t == "TankUnit" || t == "UnitEntity" || t == "BlockUnitUnit" || t == "UnitWaterMove" || t == "LegsUnit" || t == "TimedKillUnit" || t == "PayloadUnit" || t == "BuildingTetherPayloadUnit") {
		    let abils = TypeIO.readAbilities(buf);
		    
		    let ammo = buf.getFloat();
		    let building;
		    if(t == "BuildingTetherPayloadUnit"){
		    	building = buf.getInt();
		    }
		    let baserot;
		    if (t == "MechUnit") {
		        baserot = buf.getFloat();
		    }

		    let contr = TypeIO.readController(buf);
		    let elv = buf.getFloat();
		    let flag = buf.getDouble();
		    let health = buf.getFloat();
		    let shoot = buf.get();
		    let lifetime;
		    if(t == "TimedKillUnit"){
		    	lifetime = buf.getFloat();
		    }
		    let miningpos = TypeIO.readTile(buf);
		    let mounts = TypeIO.readMounts(buf);
		    let pl;
		    let payloads = [];
		    if(t == "PayloadUnit" || t == "BuildingTetherPayloadUnit"){
		    	pl = buf.getInt()
		    	for(let i = 0; i < pl; i++){
		    		let pld = TypeIO.readPayload(buf)
		    		payloads.push(pld);
		    	}
		    }
		    let plans = TypeIO.readPlansQueue(buf);
		    
		    let rotation = buf.getFloat();
		    let shield = buf.getFloat();
		    let spbycore = buf.get();
		    
		    let items = TypeIO.readItems(buf);
		    let slen = buf.getInt();
		    
		    let statuses = [];
		    for (let i = 0; i < slen; i++) {
		        let stat = TypeIO.readStatus(buf);
		        statuses.push(stat);
		    }
		    
		    let team = buf.get()
		    let time
		    if(t == "TimedKillUnit"){
		    	time = buf.getFloat();
		    }
		    let utype = buf.getShort();

		    let updbuilding = buf.get();
		    
		    let vel = TypeIO.readVec2(buf);
		    let x = buf.getFloat();
		    let y = buf.getFloat();

		    let result = {
		        abils,
		        ammo,
		        building: t === "BuildingTetherPayloadUnit" ? building : undefined,
		        baserot: t === "MechUnit" ? baserot : undefined,
		        contr,
		        elv,
		        flag,
		        health,
		        shoot,
		        lifetime: t === "TimedKillUnit" ? lifetime : undefined,
		        miningpos,
		        mounts,
		        payloads: t === "PayloadUnit" ? payloads : undefined,
		        plans,
		        rotation,
		        shield,
		        spbycore,
		        items,
		        statuses,
		        team,
		        time: t === "TimedKillUnit" ? time : undefined,
		        utype,
		        updbuilding,
		        vel,
		        position: { x, y }
		    };
		    return result;
		} else if(t == "Fire"){
			let lifetime = buf.getFloat()
			let tile = TypeIO.readTile(buf)
			let time = buf.getFloat()
			let x = buf.getFloat()
		    let y = buf.getFloat()

		    let result = {
			    lifetime,
			    tile,
			    time,
			    position: { x, y }
			};

			return result
		} else if(t == "Puddle"){
			let amount = buf.getFloat()
			let liquid = buf.getShort()
			let tile = TypeIO.readTile(buf)
			let x = buf.getFloat()
		    let y = buf.getFloat()

		    let result = {
			    amount,
			    liquid,
			    tile,
			    position: { x, y }
			};

			return result
		} else if(t == "Player"){
			let admin = buf.getBoolean();
			say(`Admin: ${formatValue(admin)}`);
		    let boost = buf.getBoolean();
		    let color = buf.getInt();
			//TypeIO.readCommand(buf);
		    let mouseX = buf.getFloat();
		    let mouseY = buf.getFloat();
			say(`Mouse pos: [yellow](${mouseX},${mouseY})[]`);
		    let name = TypeIO.readString(buf);
			say(`Name: ${formatValue(name)}`);
			buf.getShort(); // Selected block
			buf.getInt(); // Selected rotation
		    let shoot = buf.getBoolean();
		    let team = TypeIO.readTeam(buf);
		    let typing = buf.getBoolean();
		    let unit = TypeIO.readUnit(buf);
		    let x = buf.getFloat();
		    let y = buf.getFloat();

		    let result = {
			    admin,
			    boost,
			    color,
			    mouse: { x: mouseX, y: mouseY },
			    name,
			    shoot,
			    team,
			    typing,
			    unit,
			    position: { x, y }
			}
			readObjectFancy(result,'<Unit.Player>');
			return result;
		} else if(t == "WeatherState"){
			let effectt = buf.getFloat()
			let intensity = buf.getFloat()
			let life = buf.getFloat()
			let opacity = buf.getFloat()
			let weather = buf.getShort()
			let wind = TypeIO.readVec2(buf)

			let result = {
			    effectt,
			    intensity,
			    life,
			    opacity,
			    weather,
			    wind
			};
			return result
		} else if(t == "WorldLabel"){
			let flags = buf.get()
			let fonts = buf.getFloat()
			let str = TypeIO.readString(buf);
			let x = buf.getFloat()
		    let y = buf.getFloat()

		    let result = {
			    flags,
			    fonts,
			    str,
			    position: { x, y }
			}
			return result
		} else {
			return {}
		}
	}
	// mindustry.gen.`${type}.java`.readSync
	static readMain(buf:DataStream, type:string):Unit{
		//say(`[UnitIO.readMain] Reading type [acid]${type}[].`);
		switch(type){
			case `BlockUnitUnit`:{

				break;
			}
			case `CrawlUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack,statuses, team, type,
					updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			case `ElevationMoveUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack,statuses, team, type,
					updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			case `Fire`:{
				const lifetime = buf.getFloat();
				const tile = TypeIO.readTileReliable(buf);
				const time = buf.getFloat();
				const x = buf.getFloat();
				const y = buf.getFloat();
				const results:Unit = {
					lifetime, tile, time, position:{x,y}
				}
				return results;
			}
			case `LegsUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack,statuses, team, type,
					updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			case `MechUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const baseRotation = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, baseRotation, controller,
					elevation, flag, health, shooting, mineTile, mounts,
					plans, rotation, shield, spawnedByCore, stack,statuses,
					team, type, updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			case `PayloadUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const payloadsLen = buf.getInt();
				const payloads:ReturnType<typeof TypeIO.readPayload>[] = [];
				for (let i=0;i<payloadsLen;i++){
					const payload = TypeIO.readPayload(buf);
					if (!payload) continue;
					payloads.push(payload);
				}
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, payloads, plans, 
					rotation, shield, spawnedByCore, stack, statuses,
					team, type, updateBuilding, vel, position:{x,y}
				};
				return result;
			}
			case `Player`:{
				const admin = buf.getBoolean();
				const boosting = buf.getBoolean();
				const color = TypeIO.readColor(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const name = TypeIO.readString(buf);
				if (!name) throwError(`Name should not be [orange]null[]! Something is very wrong!`);
				const selectedBlock = TypeIO.readBlock(buf);
				const selectedRotation = buf.getInt();
				const shooting = buf.getBoolean();
				const team = TypeIO.readTeam(buf);
				const typeing = buf.getBoolean();
				const unit = TypeIO.readUnit(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					admin, boosting, color, aimX, aimY, name, selectedBlock,
					selectedRotation, shooting, team, typeing, unit:unit[1],
					typeID:unit[0], position:{x,y}
				}
				return result;
			}
			case `Puddle`:{
				const amount = buf.getFloat();
				const liquid = this.utils.getContentByID('liquid',buf.getShort());
				const tile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					amount, liquid, tile, position:{x,y}
				};
				return result;
			}
			case `TankUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack, statuses, team, type,
					updateBuilding, vel, position:{x,y}
				};
				return result;
			}
			case `TimedKillUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const lifetime = buf.getFloat();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const time = buf.getFloat();
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, lifetime, mineTile, mounts, plans,
					rotation, shield, spawnedByCore, stack, statuses,
					team, time, type, updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			case `UnitEntity`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack, team, type, updateBuilding,
					vel, position:{x,y}
				}
				return result;
			}
			case `UnitWaterMove`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, controller, elevation, flag,
					health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack, team, type, updateBuilding,
					vel, position:{x,y}
				}
				return result;
			}
			case `WeatherState`:{
				const effectTimer = buf.getFloat();
				const intensity = buf.getFloat();
				const life = buf.getFloat();
				const opacity = buf.getFloat();
				const weather = this.utils.getContentByID('weather',buf.getShort());
				const windVector = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					effectTimer, intensity, life, opacity, weather,
					windVector, position:{x,y}
				};
				return result;
			}
			case `WorldLabel`:{

				break;
			}
			case `TargetDummyUnit`:{
				const abilities = TypeIO.readAbilities(buf);
				const aimX = buf.getFloat();
				const aimY = buf.getFloat();
				const building = TypeIO.readBuilding(buf);
				const controller = TypeIO.readController(buf);
				const elevation = buf.getFloat();
				const flag = buf.getDouble();
				const health = buf.getFloat();
				const shooting = buf.getBoolean();
				const mineTile = TypeIO.readTileReliable(buf); // TODO: Switch to readTile
				const mounts = TypeIO.readMounts(buf);
				const plans = TypeIO.readPlansQueue(buf);
				const rotation = buf.getFloat();
				const shield = buf.getFloat();
				const spawnedByCore = buf.getBoolean();
				const stack = TypeIO.readItems(buf);
				const statLen = buf.getInt();
				const statuses:ReturnType<typeof TypeIO.readStatus>[] = [];
				for (let i=0;i<statLen;i++){
					statuses.push(
						TypeIO.readStatus(buf)
					);
				}
				const team = TypeIO.readTeam(buf);
				const type = this.utils.getContentByID('unit',buf.getShort());
				const updateBuilding = buf.getBoolean();
				const vel = TypeIO.readVec2(buf);
				const x = buf.getFloat();
				const y = buf.getFloat();
				const result:Unit = {
					abilities, aimX, aimY, building, controller, elevation,
					flag, health, shooting, mineTile, mounts, plans, rotation,
					shield, spawnedByCore, stack,statuses, team, type,
					updateBuilding, vel, position:{x,y}
				}
				return result;
			}
			default:{
				throwError(`Unknown type ${formatValue(type)}!`);
			}
		}
		throwError(`Unknown or unhandled type ${formatValue(type)}!`);
	}
	static write(buf:DataStream, unit:Unit, rev:boolean) {
	    if (rev) {
	    	if(unit.revis == undefined){
	    		let rev = this.getRev(unit.typeID!.toString());
	    		buf.putShort(rev!)
	    	} else {
	    		buf.putShort(unit.revis);
	    	}
	    }
	    this.writeMain(buf, unit);
	}

	static getRev(t:string):short|undefined{
		const r:Record<string,number> = {
		  "0": 3,
		  "2": 7,
		  "3": 7,
		  "4": 7,
		  "5": 5,
		  "10": 1,
		  "12": 1,
		  "13": 1,
		  "14": 2,
		  "16": 6,
		  "17": 5,
		  "18": 5,
		  "19": 3,
		  "20": 7,
		  "21": 6,
		  "23": 6,
		  "24": 7,
		  "26": 5,
		  "29": 3,
		  "30": 3,
		  "31": 3,
		  "32": 3,
		  "33": 3,
		  "36": 1,
		  "39": 1
		}
		return r[t] as short|undefined;
	}

	static writeMain(buf:DataStream, unit:any) {
	    const t = (unitTypes as Record<string,string>)[unit.type];

	    if (["MechUnit", "CrawlUnit", "ElevationMoveUnit", "TankUnit", "UnitEntity", "BlockUnitUnit", "UnitWaterMove", "LegsUnit", "TimedKillUnit", "PayloadUnit", "BuildingTetherPayloadUnit"].includes(t!)) {
	        TypeIO.writeAbilities(buf, unit.abils);
	        buf.putFloat(unit.ammo);

	        if (t === "BuildingTetherPayloadUnit") {
	            buf.putInt(unit.building);
	        }

	        if (t === "MechUnit") {
	            buf.putFloat(unit.baserot);
	        }

	        TypeIO.writeController(buf, unit.contr);
	        buf.putFloat(unit.elv);
	        buf.putDouble(unit.flag);
	        buf.putFloat(unit.health);
	        buf.put(unit.shoot);

	        if (t === "TimedKillUnit") {
	            buf.putFloat(unit.lifetime);
	        }

	        TypeIO.writeTile(buf, unit.miningpos);
	        TypeIO.writeMounts(buf, unit.mounts);

	        if (t === "PayloadUnit" || t === "BuildingTetherPayloadUnit") {
	            buf.putInt(unit.payloads.length);
	            for (let pld of unit.payloads) {
	                TypeIO.writePayload(buf, pld);
	            }
	        }

	        TypeIO.writePlansQueueNet(buf, unit.plans);
	        buf.putFloat(unit.rotation);
	        buf.putFloat(unit.shield);
	        buf.put(unit.spbycore);
	        TypeIO.writeItems(buf, unit.items);

	        buf.putInt(unit.statuses.length);
	        for (let stat of unit.statuses) {
	            TypeIO.writeStatus(buf, stat);
	        }

	        buf.put(unit.team);

	        if (t === "TimedKillUnit") {
	            buf.putFloat(unit.time);
	        }

	        buf.putShort(unit.utype);
	        buf.put(unit.updbuilding);
	        TypeIO.writeVec2(buf, unit.vel);
	        buf.putFloat(unit.position.x);
	        buf.putFloat(unit.position.y);
	    } else if (t === "Fire") {
	        buf.putFloat(unit.lifetime);
	        TypeIO.writeTile(buf, unit.tile);
	        buf.putFloat(unit.time);
	        buf.putFloat(unit.position.x);
	        buf.putFloat(unit.position.y);
	    } else if (t === "Puddle") {
	        buf.putFloat(unit.amount);
	        buf.putShort(unit.liquid);
	        TypeIO.writeTile(buf, unit.tile);
	        buf.putFloat(unit.position.x);
	        buf.putFloat(unit.position.y);
	    } else if (t === "Player") {
	        buf.put(unit.admin);
	        buf.put(unit.boost);
	        buf.putInt(unit.color);
	        buf.putFloat(unit.mouse.x);
	        buf.putFloat(unit.mouse.y);
	        TypeIO.writeString(buf, unit.name);
	        buf.put(unit.shoot);
	        buf.put(unit.team);
	        buf.put(unit.typing);
	        TypeIO.writeUnit(buf, unit.unit);
	        buf.putFloat(unit.position.x);
	        buf.putFloat(unit.position.y);
	    } else if (t === "WeatherState") {
	        buf.putFloat(unit.effectt);
	        buf.putFloat(unit.intensity);
	        buf.putFloat(unit.life);
	        buf.putFloat(unit.opacity);
	        buf.putShort(unit.weather);
	        TypeIO.writeVec2(buf, unit.wind);
	    } else if (t === "WorldLabel") {
	        buf.put(unit.flags);
	        buf.putFloat(unit.fonts);
	        TypeIO.writeString(buf, unit.str);
	        buf.putFloat(unit.position.x);
	        buf.putFloat(unit.position.y);
	    } else {

	    }
	}
}