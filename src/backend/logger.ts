// src/backend/logger.ts
import fs from "fs";
import path from "path";
import { namePacket } from "./Packets.js";
import { throwError } from "./textFormater.js";
import { Utils } from "./Utills.js";

export class PacketLogger {
    private static sessionDir: string | null = null;

    /** Initializes a directory for the current runtime session */
    private static getSessionDir(): string {
        if (!this.sessionDir) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            this.sessionDir = path.join("logs", `session_${timestamp}`);
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }
        return this.sessionDir;
    }

    /** Dumps raw uncompressed binary data of a failed packet */
    static saveFailedPacket(packetId: number, rawData: Buffer | Uint8Array, error: unknown) {
        try {
            const dir = this.getSessionDir();
            const time = Date.now();
            const fileName = `failed_pkt_id_${packetId}_${time}.bin`;
            const filePath = path.join(dir, fileName);

            // Write the raw bytes to file
            fs.writeFileSync(filePath, rawData);

            // Append metadata to a text log file in the same session folder
            this.log(`Packet ${namePacket(packetId)} (ID: ${packetId}) failed. Saved raw data to ${fileName}. Error: ${error}`,true);
        } catch (e) {
            console.error("Failed to write packet log:", e);
        }
    }

    /** Adds a message to the session log, by default with a timestamp. */
    static log(message:string, showTime=true){
        try {
            const dir = this.getSessionDir();
            const logMessage = `${showTime?`[${new Date().toISOString()}]`:` `}${message}\n`;
            fs.appendFileSync(path.join(dir, "session.log"), logMessage);
        }catch(e){
            console.error("Failed to write packet log:", e);
        }
    }

    static throwLoggedError(error:string|Error, showTime=true):never{
        if (error instanceof Error){
            let e = error.stack??error.message;
            e = Utils.escapeColors(e);
            e = Utils.escapeGlyphs(e);
            this.log(e,showTime);
            throwError(e);
        }else{
            let e = Utils.escapeColors(error);
            e = Utils.escapeGlyphs(error);
            this.log(e,showTime);
            throwError(e);
        }
    }
}