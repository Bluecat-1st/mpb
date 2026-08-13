
export type int    = number & { readonly __brand: "int"    };
export type uint   = number & { readonly __brand: "uint"   };
export type float  = number & { readonly __brand: "float"  };
export type short  = number & { readonly __brand: "short"  };
export type ushort = number & { readonly __brand: "ushort" };
export type long   = number & { readonly __brand: "long"   };
export type double = number & { readonly __brand: "double" };
export type byte   = number & { readonly __brand: "byte"   };
export type ubyte  = number & { readonly __brand: "ubyte"  };

export type nullableInt    = int    | null;
export type nullableUint   = uint   | null;
export type nullableFloat  = float  | null;
export type nullableShort  = short  | null;
export type nullableUshort = ushort | null;
export type nullableLong   = long   | null;
export type nullableDouble = double | null;
export type nullableByte   = byte   | null;
export type nullableString = string | null;

export const int   = (n: number): int => Math.floor(n) as int;
export const float = (n: number): float => n as float;
export const short = (n: number): short => (n | 0) as short;
export const byte  = (n: number): byte => (Math.max(Math.min(0,int(n)),255)) as byte;

export type  boolByte = byte & (0|1);
export const boolByte = (n:unknown): boolByte => {
    if (typeof n === 'number'){
        if (!Number.isInteger(n)) throw new TypeError(`'${n}' is not an intiger!`);
        if (n>1) throw new TypeError(`'${n}' is not 1 or 0!`);
        if (n<0) throw new TypeError(`'${n}' is not 1 or 0!`);
        return (n===0?0:1) as boolByte;
    }else if (typeof n === 'boolean'){
        return (n?1:0) as boolByte;
    }else{
        throw new TypeError(`Can't parse type '${typeof n}' into a boolByte.`);
    }
};
export const byteTrue  = boolByte(true);
export const byteFalse = boolByte(false);
