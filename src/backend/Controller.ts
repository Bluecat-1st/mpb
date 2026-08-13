// src/backend/Controller.ts
import type { float, int, nullableString } from "./primitives.js";
import type { Player } from "./Player.js";
import type { Plan } from "./TypeIO.js";
import { say } from "./textFormater.js";
import { Phys } from "./Phys.js";

export class Controller{
    player;
    xDelta:float;
    yDelta:float;
    xVel;
    yVel;
    pointerX;
    pointerY;
    rotation:number|null;
    rotationDelta;
    miningpos:{x:number,y:number}|null;
    boost;
    shoot;
    chatting;
    build;
    plans:(Plan|null)[];
    viewX;
    viewY;
    viewWidth;
    viewHeight;
	/** Assiting? */
    assisting;
    status:null|'follow'|'move';
    targetX?:number;
    targetY?:number;
    speed?:number;
    range?:number;
	/** Player the bot is following or assiting? */
    playerName:nullableString;
	selectedBlock:nullableString;
	selectedRotation:int;
	constructor(player:Player){
		this.player = player;

		this.xDelta = <float>0;
		this.yDelta = <float>0;

		this.xVel = <float>0;
		this.yVel = <float>0;

		this.pointerX = <float>0;
		this.pointerY = <float>0;

		this.rotation = 0;
		this.rotationDelta = 0;

		this.miningpos = null;

		this.boost = false;
		this.shoot = false;
		this.chatting = false;
		this.build = true;

		this.playerName = null;

		this.selectedBlock = null;
		this.selectedRotation = <int>0;

		this.plans = [];

		this.viewX = <float>0;
		this.viewY = <float>0;
		this.viewWidth = 0;
		this.viewHeight = 0;

		this.assisting = false

		this.status = null
	}
	calcStatus(){
		let targetx, targety;
		let cposx = this.player.unit.position!.x;
	    let cposy = this.player.unit.position!.y;

	    if(this.status == "move" || this.status == "follow"){
	        if(this.status == "move"){
	            targetx = this.targetX;
	            targety = this.targetY;
	        } else if(this.status == "follow"){
	            let t1 = Object.entries(this.player.nc.units!).filter(([k, v]) => v.name == this.playerName)
	            let tunit = t1.length > 0 ? (t1[0]!.length > 0 ? t1[0]![1] : null) : null
	            if(tunit){
	                targetx = tunit.position!.x;
	                targety = tunit.position!.y;
	            }else{
					this.player.nc.game.call.sendChatMessage(`[#f00]Did not find player unit for [yellow]${this.playerName}[], stopping follow.`);
					this.clearStatus();
					this.playerName = null;
				}
	        }

	        let dx = (targetx! - cposx) as float;
	        let dy = (targety! - cposy) as float;
	        
	        let distance = Math.sqrt(dx * dx + dy * dy);
	        let speed = this.speed!;
	        
			//say(`[Controller.calcStatus] ${distance} | ${this.range}`);
			//say(`[Controller.calcStatus] (${cposx},${cposy})`);
	        if (distance > this.range!) {
	            dx = (dx/distance) as float;
	            dy = (dy/distance) as float;
	            dx = (dx*Math.min(distance, speed!)) as float;
	            dy = (dy*Math.min(distance, speed!)) as float;
	            this.move(dx, dy);
	        } else {
	        	if(this.status == "move") this.status = null;
	        }
	    }

	    if(this.assisting){
	    	const t1 = Object.entries(this.player.nc.units!).filter(([k, v]) => v.name == this.playerName)
	        const tunit = t1.length > 0 ? (t1[0]!.length > 0 ? t1[0]![1] : null) : null;
	        //let funit = tunit?.unit ? tunit?.unit[1] : 0 || 0;
			let funit = this.player.nc.units![tunit?.unit ?? <int>-2];
	        let plans = funit?.plans;
	        if(!plans) return;
	        this.plans = plans.filter((plan) => plan !== null);
	    }
	}
	doTick(){

		this.plans = this.plans.filter(plan => plan !== null);

		if(!this.player.unit.position){
			this.player.unit.position = {x:<float>0,y:<float>0};
		}

		this.player.unit.position.x = (this.player.unit.position.x + this.xDelta) as float;
		this.player.unit.position.y = (this.player.unit.position.y + this.yDelta) as float;
		//this.player.unit.position.x = (this.player.unit.position.x + this.xVel) as float;
		//this.player.unit.position.y = (this.player.unit.position.y + this.xVel) as float;

		this.xDelta = <float>0;
		this.yDelta = <float>0;

		this.calcStatus();
		try{
			if(!this.player.nc.config?.disablePhysic){
				Phys.collide(this.player.unit, Object.values(this.player.nc.units!))
			}
		} catch(e){
			console.log(e);
		}

		this.player.unit.px = this.pointerX;
		this.player.unit.py = this.pointerY;

		this.player.unit.rotation = (this.player.unit.rotation + this.rotationDelta) % 360;
		if (this.player.unit.rotation < 0) {
		  	this.player.unit.rotation += 360;
		}
		if(this.rotation){
			this.player.unit.rotation = this.rotation;
			//this.rot = null;
		}

		this.rotationDelta = 0;

		this.player.unit.baserot = this.player.unit.rotation;

		if(!this.player.unit.vel) this.player.unit.vel = {x:<float>0,y:<float>0};

		// -- Maybe?

		this.xVel = this.xDelta;
		this.yVel = this.yDelta;

		// --

		this.player.unit.vel.x = this.xVel;
		this.player.unit.vel.y = this.yVel;

		this.player.unit.miningpos = this.miningpos ?? {x:-1,y:-1};

		this.player.unit.boost = this.boost;
		this.player.unit.shoot = this.shoot;
		this.player.unit.chat = this.chatting;
		this.player.unit.build = this.build;

		this.player.unit.selectedBlock = this.selectedBlock;
		this.player.unit.selectedRotation = this.selectedRotation;

		this.player.unit.plans = this.plans as Plan[]; // The plans were already filtered

		this.player.unit.viewX = this.viewX;
		this.player.unit.viewY = this.viewY;
		this.player.unit.viewWidth = this.viewX;
		this.player.unit.viewHeight = this.viewY;
	}
	pointer(x:float, y:float){
		this.pointerX = x;
		this.pointerY = y;
	}
	move(x:float, y:float){
		//say(`[Controller.move] ${x},${y}`);
		this.xDelta = (this.xDelta + x) as float;
		this.yDelta = (this.yDelta + y) as float;
	}
	moveTo(x:number, y:number, speed = 8, range = 16){
		this.status = "move";
		this.speed = speed;
		this.targetX = x;
		this.targetY = y;
		this.range = range;
	}
	follow(playerName:string, speed = 8, range = 8){
		this.status = "follow";
		this.speed = speed;
		this.playerName = playerName;
		this.range = range;
	}
	assist(playerName:nullableString = null){
		if(playerName){
			this.assisting = true;
			this.follow(playerName, 32, 32);
		} else {
			this.assisting = false;
			this.clearStatus();
		}
	}
	clearPlans(){
		this.plans = [];
	}
	clearStatus(){
		this.status = null;
		this.mine(-1, -1);
	}
	/**
	 * Rotate player unit to an angle.
	 * @param target - The angle to rotate to
	 */
	rotate(target:number, absolute:true):void;
	/**
	 * Rotate player unit by an amount.
	 * @param delta - How far to rotate.
	 */
	rotate(delta:number, absolute:false):void;
	rotate(rotation:number, absolute:boolean){
		if(absolute){
			this.rotation = rotation;
		} else {
			this.rotationDelta += rotation;
		}
	}
	/** Set the chatting status. */
	chating(arg:boolean):void;
	/** Toggle the chatting status. */
	chating():void;
	chating(arg?:boolean){
		this.chatting = arg ?? !this.chatting;
	}
	building(arg?:boolean){
		this.build = arg ?? !this.build;
	}
	boosting(arg?:boolean){
		this.boost = arg ?? !this.boost;
	}
	shooting(arg?:boolean){
		this.shoot = arg ?? !this.shoot;
	}
	/** Rotate the player unit to face a position. */
	target(x:number, y:number){
		let cposx = this.player.unit.position!.x;
	    let cposy = this.player.unit.position!.y;
        let deltax = x - cposx;
	    let deltay = y - cposy;

	    let angler = Math.atan2(deltay, deltax);

	    let angled = angler * (180 / Math.PI);

	    this.rotate(angled, true);
	}
	velocity(x:float, y:float){
		this.xVel = x;
		this.yVel = y;
	}
	mine(x:number, y:number){
		if(x == -1 || y == -1){
			this.miningpos = null
		} else {
			this.miningpos = {x,y}
		}
	}
}