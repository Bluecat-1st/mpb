
export const ANSI_CODES: Record<string, string> = {
    // Reset
    'reset': '\x1b[0m',
    // Styles
    'bold': '\x1b[1m',
    'dim': '\x1b[2m',
    'italic': '\x1b[3m',
    'underline': '\x1b[4m',
    // Standard Colors
    'black': '\x1b[30m',
    'red': '\x1b[31m',
    'green': '\x1b[32m',
    'orange': '\x1b[33m',
    'blue': '\x1b[34m',
    'purple': '\x1b[35m',
    'cyan': '\x1b[36m',
    //'white': '\x1b[37m',
    'gray': '\x1b[90m',
    // Custom colors
    'yellow': '\x1b[38;2;255;255;0m',
    'acid': '\x1b[38;2;0;255;0m',
    'white': '\x1b[38;2;255;255;255m',

    // I don't know what mindustry's [accent] tag is.
    'accent': '\x1b[3m\x1b[33m',
    'scarlet': '\x1b[38;2;255;0;0m'
};
const knownANSICodes:string[] = [];
for (let key of Object.keys(ANSI_CODES)){
    knownANSICodes.push(ANSI_CODES[key]!);
}

/**
 * Throws an error but formats the message with red, bold text.
 *
 * (Formated with `[red][bold]text`)
 * @param text - The error message.
 */
export function throwError(text: string):never;
/**
 * Throws a a error but formats it first.
 * @param error 
 */
export function throwError(error: Error):never;
export function throwError(text: string|Error): never {
    if (text instanceof Error){
        text.message = formatText(`[red][bold]${text.message}`);
        throw text;
    }
    throw new Error(formatText(`[red][bold]${text}`));
}
/**
 * Prints out a warning to the console with yellow text.
 * This uses `formatText()` so you can use text formating`.
 * @param text - The warning message.
 */
export function warn(text: string) {
    console.log(formatText(`[yellow]${text}`));
}
/**
 * Prints text to the console with text formating. Ex:`"[red]Red[reset] text."`
 * @param text - The text with formating.
 */
export function say(text: string) {
    console.log(formatText(text));
}
export function unformatText(text: string): string {
    const tagRegex = /\[(.*?)\]/g;

    let parsedText = text.replace(tagRegex, (match, tagContent: string) => {
        const cleanTag = tagContent.toLowerCase().trim();
        if (cleanTag in ANSI_CODES) {
            return '';
        }
        if (cleanTag.startsWith('#')) {
            const hex = cleanTag.substring(1);
            if (/^[0-9a-f]{6}$/.test(hex) || /^[0-9a-f]{3}$/.test(hex)) {
                return ``;
            }
        }
        return match;
    });
    return parsedText;
}
/**
 * Cleans the output of formatText()
 */
export function cleanFormatedText(text: string): string {
    const tagRegex = /\[(.*?)\]/g;

    let parsedText = text.replace(tagRegex, (match, tagContent: string) => {
        const cleanTag = tagContent.toLowerCase().trim();
        if (cleanTag.startsWith('\x1b')) {
            return '';
        }
        return match;
    });
    return parsedText;
}
/**
 * Parses Mindustry's formatting tags into terminal-readable ANSI escape codes.
 */
export function formatText(text: string): string {
    const tagRegex = /\[(.*?)\]/g;

    let parsedText = text.replace(tagRegex, (match, tagContent: string) => {
        const cleanTag = tagContent.toLowerCase().trim();
        if (cleanTag in ANSI_CODES) {
            return ANSI_CODES[cleanTag]!;
        }
        if (cleanTag.startsWith('#')) {
            const hex = cleanTag.substring(1);
            if (/^[0-9a-f]{6}$/.test(hex)) {
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                return `\x1b[38;2;${r};${g};${b}m`;
            } else if (/^[0-9a-f]{3}$/.test(hex)) {
                const r = parseInt(hex[0]! + hex[0], 16);
                const g = parseInt(hex[1]! + hex[1], 16);
                const b = parseInt(hex[2]! + hex[2], 16);
                return `\x1b[38;2;${r};${g};${b}m`;
            }
        }
        return match;
    });
    return parsedText + ANSI_CODES['reset'];
}

