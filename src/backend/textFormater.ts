// Redone with Gemeni as I'm not even sure how I would have fixed this stuff....

export const ANSI_CODES: Record<string, string> = {
    // Reset
    'reset': '\x1b[0m',
    'clear': '\x1b[0m',

    // Styles
    'bold': '\x1b[1m',
    'dim': '\x1b[2m',
    'italic': '\x1b[3m',
    'underline': '\x1b[4m',

    // Standard & Mindustry Named Colors
    'black': '\x1b[30m',
    'white': '\x1b[38;2;255;255;255m',
    'gray': '\x1b[90m',
    'grey': '\x1b[90m',
    'lightgray': '\x1b[38;2;20BF20m',
    'lightgrey': '\x1b[38;2;191;191;191m',
    'darkgray': '\x1b[38;2;76;76;76m',
    'darkgrey': '\x1b[38;2;76;76;76m',

    'red': '\x1b[31m',
    'scarlet': '\x1b[38;2;255;52;48m',
    'coral': '\x1b[38;2;255;120;105m',
    'orange': '\x1b[33m',
    'yellow': '\x1b[38;2;255;255;0m',
    'acid': '\x1b[38;2;0;255;0m',
    'green': '\x1b[32m',
    'lime': '\x1b[38;2;133;229;107m',
    'forest': '\x1b[38;2;56;125;68m',
    'cyan': '\x1b[36m',
    'blue': '\x1b[34m',
    'navy': '\x1b[38;2;43;59;120m',
    'purple': '\x1b[35m',
    'violet': '\x1b[38;2;164;115;231m',
    'magenta': '\x1b[38;2;232;86;210m',
    'crimson': '\x1b[38;2;189;43;58m',
    'gold': '\x1b[38;2;243;211;86m',
    'sky': '\x1b[38;2;132;162;239m',
    'pink': '\x1b[38;2;226;125;170m',

    // Mindustry UI Palette Colors
    'accent': '\x1b[38;2;255;211;127m', // Standard Mindustry gold/orange accent
    'unactive': '\x1b[38;2;160;160;160m',
    'stat': '\x1b[38;2;255;211;127m'
};

/**
 * Converts a hex code tag content (without '#') into an RGB ANSI escape code sequence.
 */
function parseHexColor(hex: string): string | null {
    let r = 0, g = 0, b = 0;

    if (hex.length === 1) { // e.g. #f -> #ffffff
        const val = parseInt(hex + hex, 16);
        if (isNaN(val)) return null;
        r = g = b = val;
    } else if (hex.length === 3 || hex.length === 4) { // e.g. #f00 or #f00f (with alpha)
        r = parseInt(hex[0]! + hex[0], 16);
        g = parseInt(hex[1]! + hex[1], 16);
        b = parseInt(hex[2]! + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) { // e.g. #ff0000 or #ff0000ff
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else {
        return null;
    }

    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Parses Mindustry's formatting tags into terminal-readable ANSI escape codes.
 * Supports color stacks ([]), hex codes ([#f00], [#f]), named colors, and escaped brackets ([[red]).
 */
export function formatText(text: string): string {
    // Escaped brackets handle: replace "[[" temporarily to prevent tag matching
    let processed = text.replace(/\[\[/g, '\u0000');

    const colorStack: string[] = [];

    // Match tags like [red], [#f00], [], etc.
    const tagRegex = /\[(.*?)\]/g;

    processed = processed.replace(tagRegex, (match, tagContent: string) => {
        const cleanTag = tagContent.toLowerCase().trim();

        // 1. Pop/Clear color tag []
        if (cleanTag === '') {
            colorStack.pop(); // Remove top color
            const previousColor = colorStack[colorStack.length - 1];
            return previousColor ? previousColor : ANSI_CODES['reset']!;
        }

        // 2. Named ANSI Code
        if (cleanTag in ANSI_CODES) {
            const ansi = ANSI_CODES[cleanTag]!;
            // Only add colors to stack, ignore style toggles like bold/italic for stack popping
            if (!['bold', 'dim', 'italic', 'underline', 'reset', 'clear'].includes(cleanTag)) {
                colorStack.push(ansi);
            }
            return ansi;
        }

        // 3. Hex Color Codes ([#f], [#f00], [#ff0000], etc.)
        if (cleanTag.startsWith('#')) {
            const ansi = parseHexColor(cleanTag.substring(1));
            if (ansi) {
                colorStack.push(ansi);
                return ansi;
            }
        }

        return match; // Return raw string if tag is unknown
    });

    // Restore escaped brackets [[ -> [
    processed = processed.replace(/\u0000/g, '[');

    return processed + ANSI_CODES['reset'];
}

/**
 * Completely removes ANSI escape codes from a string (useful before sending logs to Mindustry chat).
 */
export function stripANSI(text: string): string {
    // Matches all ANSI terminal escape sequences
    const ansiRegex = /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=>]/g;
    return text.replace(ansiRegex, '');
}

/**
 * Removes all formatting tags (e.g. [red], [#f00], []) leaving raw plain text.
 */
export function unformatText(text: string): string {
    let processed = text.replace(/\[\[/g, '\u0000');
    
    // Matches tags like [color], [#hex], and []
    const tagRegex = /\[(.*?)\]/g;
    processed = processed.replace(tagRegex, (match, tagContent: string) => {
        const cleanTag = tagContent.toLowerCase().trim();
        if (cleanTag === '' || cleanTag in ANSI_CODES || cleanTag.startsWith('#')) {
            return '';
        }
        return match;
    });

    return processed.replace(/\u0000/g, '[');
}

/**
 * Cleans both ANSI code sequences and Mindustry tags from a string.
 */
export function cleanFormatedText(text: string): string {
    return unformatText(stripANSI(text));
}

export function throwError(text: string): never;
export function throwError(error: Error): never;
export function throwError(text: string | Error): never {
    if (text instanceof Error) {
        text.message = formatText(`[red][bold]${text.message}`);
        throw text;
    }
    throw new Error(formatText(`[red][bold]${text}`));
}

export function warn(text: string) {
    console.log(formatText(`[yellow]${text}`));
}

export function say(text: string) {
    console.log(formatText(text));
}

