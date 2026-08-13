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
    /** Some packets groups to hide */
    hideGroup:{
        /** Unit related stuff */
        units:true,
        /** Building and decontructing */
        contruction:true,
    },
    dataStreamStatusPrint:true,
    hideIncompletPacketWarning:false,
    server:{
        /*
        IPs:
        * localhost:      The localhost server
        * 127.0.0.1:      Just the IP version of localhost.
        * 162.248.101.53: Fish Sandbox (Public server)

        */
        ip:"localhost",
        port:6567
    }
} as const;

say(`Config loaded:`);
readObjectFancy(config,'config');
say(`-`.repeat(10));