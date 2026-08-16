// src/backend/botConfig.ts
import { say } from "./textFormater.js"
import { readObjectFancy } from "./Utills.js";

/** Some configeration, mostly for debugging. */
export const config = {
    // DO NOT EDIT THE VERSION IF YOU DON'T KNOW WHAT YOU ARE DOING!
    version:159,
    dontCompress:false,
    showAllPackets:false,
    hidePacketSends:false,
    hidePacketReseives:true,
    getAssets:false,
    /** Some packets groups to hide */
    hideGroup:{
        /** Unit related stuff */
        units:true,
        /** Building and decontructing */
        contruction:true,
    },
    dataStreamStatusPrint:false,
    hideIncompletPacketWarning:false,
    /** None of the listeners work right now, so this can be left off. */
    setupPlayerListeners:false,
    /** Removes color formating tags and some gliphs */
    escapeMessageFormating:false,
    /** Some people for some reason send messages with gliphs at the end I can get rid of using normal JS methods, so this whitelist forces them out, however it is a a cost of not being able to use Mindustry's icons/emojis without having to manualy whitelist them.... */
    whitelistGliphFiltering:true,
    server:{
        /*
        IPs:
        * localhost:      The localhost server
        * 127.0.0.1:      Just the IP version of localhost.
        * 162.248.101.53: Fish Sandbox (Public server)

        */
        ip:"162.248.101.53",
        port:6567
    },
    name:"mpb (Bot)",
    commandPrefix:"mpb",
    uuid:"UUIDAAAAAAA=",
    usid:"USIDAAAAAAA="
} as const;

say(`Config loaded:`);
readObjectFancy(config,'config');
say(`-`.repeat(10));