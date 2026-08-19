import type { float, int, short, byte } from "./primitives.js";
import type { NetClient, Unit } from "./client.js";
import type { DataStream } from "./DataStream.js";
import type { Plan } from "./TypeIO.js";
import type { Tile } from "./Tiles.js";
import type { Call } from "./Call.js";
import { say, throwError, warn } from './textFormater.js';
import { packets as Packets } from "./Packets.js";
import { Controller } from "./Controller.js";
import { config } from "./botConfig.js";
import { SchemeIO } from "./ScemIO.js";
import { TypeIO } from "./TypeIO.js";
import { Utils } from "./Utills.js";

export class Player {
	name?:string
	tickTime = 66 // 1/15(66.6)
    nc:NetClient;
	/** Shorthand to {@link Call} */
	call:Call;
	/** The player's ID */
    id:number;
    unit:Unit;
    controller:Controller;
	/** The current snapshot ID */
    snapid;
    interval:NodeJS.Timeout|undefined;
	admin = false;
	constructor(nc:NetClient, id:number){
		say(`MPB's player ID is [acid]${id}`);
		this.nc = nc;
		this.call = nc.game.call;
		this.id = id;

		// If the PlayerSpawnCallPacket gets called before NetClient.loadWorld().
		if (nc.units && nc.units[id]){
			this.unit = nc.units[id];
		}else{
			this.unit = {};
		}

		this.controller = new Controller(this);

		this.snapid = 0;

		setTimeout(() => {
			this.interval = setInterval(() => this.tick(), nc.config?.csTime ?? this.tickTime)
		}, 100);
		if (config.setupPlayerListeners){
			this.setupListeners();
		}
	}
	read(buf:DataStream){
		//buf.skip(1); // I don't know what I'm doing...
		//return  UnitIO.read(buf,<byte>12);
		this.unit.revis = buf.getShort();
		this.admin = buf.getBoolean(); // Admin
		if (this.admin) throwError(`This bot should NOT be an admin!`);
		this.controller.boosting(buf.getBoolean());
		buf.getInt(); // Color
		TypeIO.readCommand(buf);
		this.controller.pointer(buf.getFloat(),buf.getFloat());
		this.name = TypeIO.readString(buf)!; // Name
		buf.getShort(); // Selected block
		this.controller.selectedRotation = buf.getInt();
		this.controller.shooting(buf.getBoolean());
		TypeIO.readTeam(buf);
		this.controller.chating(buf.getBoolean());
		TypeIO.readUnit(buf);
		buf.getFloat();
		buf.getFloat();
		//this.unit.position = {
		//	x:buf.getFloat(),
		//	y:buf.getFloat()
		//}
		//say(`Unit pos: ${this.unit.position.x},${this.unit.position.x}`);
	}
	setupListeners(){
		this.nc.on("BeginPlaceCallPacket", (p:InstanceType<typeof Packets.BeginPlaceCallPacket>) => {
			let tile = this.nc.game.world.get(p.x!, p.y!);
			if (!tile){
				warn(`No tile at [italic](${p.x},${p.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building at [italic](${p.x},${p.y})[reset][yellow].`);
				return;
			}
			tile.setBlock(p.result!);
			tile.build[0].team = p.team!;
			tile.build[0].rotation = p.rotation!;
			tile.build[0].atConstruct = true;
		});
		this.nc.on("BeginBreakCallPacket", (p:InstanceType<typeof Packets.BeginBreakCallPacket>) => {
			let tile = this.nc.game.world.get(p.x!, p.y!);
			if (!tile){
				warn(`No tile at [italic](${p.x},${p.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building at [italic](${p.x},${p.y})[reset][yellow].`);
				return;
			}
			tile.build[0].atConstruct = true;
		});
		this.nc.on("ConstructFinishCallPacket", (p:InstanceType<typeof Packets.ConstructFinishCallPacket>) => {
			const tile = this.nc.game.world.get(p.tile!.x, p.tile!.y);
			if (!tile){
				warn(`No tile at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}
			tile.setBlock(p.block!);
			tile.build[0].atConstruct = false;
			for(let i = 0; i < this.controller.plans.length; i++){
				let plan = this.controller.plans[i]
				if(!plan) continue;
				if(plan.position.x == p.tile!.x && plan.position.y == p.tile!.y){
					this.controller.plans[i] = null;
				}
			}
		});
		this.nc.on("DeconstructFinishCallPacket", (p:InstanceType<typeof Packets.DeconstructFinishCallPacket>) => {
			let tile = this.nc.game.world.get(p.tile!.x, p.tile!.y);
			if (!tile){
				warn(`No tile at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}
			tile.build[0].atConstruct = false;
			for(let i = 0; i < this.controller.plans.length; i++){
				let plan = this.controller.plans[i]
				if(!plan) continue;
				if(plan.position.x == p.tile!.x && plan.position.y == p.tile!.y){
					this.controller.plans[i] = null;
				}
			}
		});
		this.nc.on("RemoveQueueBlockCallPacket", (p:any) => {
			for(let i = 0; i < this.controller.plans.length; i++){
				let plan = this.controller.plans[i]
				if(!plan) continue;
				if(plan.position.x == p.x && plan.position.y == p.y){
					this.controller.plans[i] = null;
				}
			}
		});
		this.nc.on("SetTileCallPacket", (p:InstanceType<typeof Packets.SetTileCallPacket>) => {
			let tile = this.nc.game.world.get(p.tile!.x, p.tile!.y);
			if (!tile){
				warn(`No tile at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}
			tile.setBlock(p.block!);
			tile.build[0].team = p.team!;
			tile.build[0].rotation = p.rotation!;
		});
		this.nc.on("RotateBlockCallPacket", (p:InstanceType<typeof Packets.RotateBlockCallPacket>) => {
			let tile = this.nc.game.world.get(p.build!.x as number as int, p.build!.y as number as int)!;
			if (!tile){
				warn(`No tile at [italic](${p.build?.x},${p.build?.y})[reset][yellow].`);
				return;
			}else if (!tile.build){
				warn(`No building on [italic](${p.build?.x},${p.build?.y})[reset][yellow].`);
				return;
			}
			tile.build[0].rotation = (tile.build[0].rotation + (p.direction ? 1 : -1)) as int;
		});
		this.nc.on("SetFloorCallPacket", (p:InstanceType<typeof Packets.SetFloorCallPacket>) => {
			let tile = this.nc.game.world.get(p.tile!.x, p.tile!.y);
			if (!tile){
				warn(`No tile at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}
			tile.setFloor(p.floor!);
			tile.setOverlay(p.overlay!);
		});
		this.nc.on("SetOverlayCallPacket", (p:InstanceType<typeof Packets.SetOverlayCallPacket>) => {
			let tile = this.nc.game.world.get(p.tile!.x, p.tile!.y);
			if (!tile){
				warn(`No tile at [italic](${p.tile!.x},${p.tile!.y})[reset][yellow].`);
				return;
			}
			tile.setOverlay(p.overlay!);
		});
	}
	tick(){
		//console.log(this.unit);
		//this.unit = this.nc.units![this.id] ?? {};
		//console.log(this.nc.units![this.id]);
		//console.log('--');
		/*
		let unit = this.nc.units![this.unit?.unit?.length > 0 ? this.unit?.unit[1] : undefined] || {}

		//this.nc.reset();

		for (let key in unit) {
            this.unit[key] = unit[key];
        }*/

		this.controller.doTick();

		this.clientSnap();
	}
	/** Send a client snapshot */
	clientSnap(){
		let p = new Packets.ClientSnapshotCallPacket();
		p.snapshotID = this.snapid++ as int;
		p.unitID = this.unit.unit!;
		p.dead = this.unit.health > 0;
		p.x = (this.unit.position?.x??0) as float;
		p.y = (this.unit.position?.y??0) as float;
		//say(`Sending pos ${p.x},${p.y}`);
		p.pointerX = this.unit.px;
		p.pointerY = this.unit.py;
		p.rotation = this.unit.rotation;
		p.baseRotation = this.unit.baserot;
		p.xVelocity = this.unit.vel!.x;
		p.yVelocity = this.unit.vel!.y;
		p.mining = this.unit.miningpos as Tile; // I don't really care right now...
		p.boosting = this.unit.boost;
		p.shooting = this.unit.shoot;
		p.chatting = this.unit.chat;
		p.building = this.unit.build;

		p.selectedBlock = this.unit.selectedBlock!;
		p.selectedRotation = this.unit.selectedRotation;

		p.plans = this.unit.plans!;
		p.viewX = this.unit.viewX!;
		p.viewY = this.unit.viewY!;
		p.viewWidth = this.unit.viewWidth!;
		p.viewHeight = this.unit.viewHeight!;
		this.nc.send(p, false);
	}
	build(x:int, y:int, block:string, config:{rotation:byte,object:ReturnType<typeof TypeIO.readObject>}, ignore:any){
		/*
		let blockID = typeof block == "string" ? Utils.getBlockByName(block) : block

		if(this.nc.game.world.get(x, y)!.block == blockID || (!ignore && this.nc.game.world.get(x, y)!.block != 0)){
			return
		}*/
		if (this.nc.game.world.get(x, y)?.block === block || (!ignore && this.nc.game.world.get(x,y)?.block)){
			return;
		}

		for(let i = 0; i < this.controller.plans.length; i++){
			let plan = this.controller.plans[i]
			if(!plan) continue;
			if(plan.position.x == x && plan.position.y == y){
				return
			}
		}

		let rotation = config?.rotation || <byte>0
		let object = config?.object || <ReturnType<typeof TypeIO.readObject>>[0,null];
		let pos = {x, y}
		let plan:Plan = {
			breakPlan: false,
			position: pos,
			//block: blockID,
			block,
			rotation,
			hasConfig: true,
			config: object
		}
		this.controller.plans.push(plan);
	}
	buildBase64Scheme(base64schm:string, x:number, y:number){
		let sch = SchemeIO.readBase64(base64schm);
		let plans = SchemeIO.toBuildPlans(sch.res, x, y);

		this.controller.plans = this.controller.plans.concat(plans);
	}
	break(x:int, y:int){
		if(!this.nc.game.world.tiles.get(x,y)?.block){
			return
		}

		for(let i = 0; i < this.controller.plans.length; i++){
			let plan = this.controller.plans[i];
			if(!plan) continue;
			if(plan.position.x == x && plan.position.y == y){
				return;
			}
		}

		let pos = {x, y};

		let plan:Plan = {
			breakPlan: true,
			position: pos
		}
		this.controller.plans.push(plan);
	}
	locate(type:any, target:string, x:number, y:number){
		x = x || this.unit?.position!.x / 8;
		y = y || this.unit?.position!.y / 8;
		let res:{tile:any,distance:number}[] = [];
		const dst = (x1:number, y1:number, x2:number, y2:number) => {
		    const dx = x2 - x1;
		    const dy = y2 - y1;
		    return Math.sqrt(dx * dx + dy * dy);
		};
		this.nc.game.world.each((x2, y2, tile:any) => {
			if(tile[type] == target || tile[type] == Utils.getBlockByName(target)){
				res.push({tile: tile, distance: dst(x, y, x2, y2)});
			}
		})
		return res;
	}
	command(unitids:int[], config:{buildTarget?:{x:short,y:short},unitTarget?:[byte,int],posTarget?:{x:float,y:float}}){
		let buildTarget = config.buildTarget || {x:<short>-1,y:<short>-1};
		let unitTarget = config.unitTarget || [<byte>0,<int>0];
		let posTarget = config.posTarget || {x:<float>0,y:<float>0};

		let p = new Packets.CommandUnitsCallPacket();

		p.unitIds = unitids;
		p.buildTarget = buildTarget;
		p.unitTarget = unitTarget;
		p.posTarget = posTarget;

		this.nc.send(p, true);
	}
	takeItems(x:short, y:short, item:short|string, amount = <int>1){
		const pos = {x, y};
		const it = typeof item == "number" ? this.nc.game.utils.getContentByID('item',item) : item;
		if (!it){
			warn(`Did not find item ID for [purple]${item}`);
			return;
		}
		const unit = this.unit.unit

		const p = new Packets.RequestItemCallPacket();

		p.player = unit!;
		p.build = pos;
		p.item = it;
		p.amount = amount;

		this.nc.send(p, true);
	}
	dropItem(){
		let p = new Packets.DropItemCallPacket();

		p.angle = <float>0;

		this.nc.send(p, true);
	}
	rotateBlock(x:short, y:short, dir:byte){
		let dire = dir == 0 ? <byte>-1 : dir;
		let pos = {x, y};

		let p = new Packets.RotateBlockCallPacket();

		p.build = pos;
		p.direction = dire;

		this.nc.send(p, false);
	}
	transferItemsTo(x:short, y:short){
		let pos = {x, y}

		let p = new Packets.TransferInventoryCallPacket();

		p.build = pos;

		this.nc.send(p, true);
	}
	pickupBlock(){
		let build = {x: <short>Math.round(this.unit.position!.x / 8), y: <short>Math.round(this.unit.position!.y / 8)}

		let p = new Packets.RequestBuildPayloadCallPacket();

		p.build = build;

		this.nc.send(p, true);
	}
	pickupUnit(unit?:int){
		let un = (!unit ? [0, 0] : [2, unit]) as [byte, int];

		let p = new Packets.RequestUnitPayloadCallPacket();

		p.target = un;

		this.nc.send(p, true);
	}
	dropPayload(){
		let p = new Packets.RequestDropPayloadCallPacket();

		p.x = this.unit.position!.x;
		p.y = this.unit.position!.y;

		this.nc.send(p, true);
	}
	control(unit:int){
		let un = [2, unit] as [byte, int];

		let p = new Packets.UnitControlCallPacket();

		p.unit = un;

		this.nc.send(p, true);
	}
	respawn(){
		this.call.unitClear();
	}
	stop(){
		clearInterval(this.interval);
	}
}