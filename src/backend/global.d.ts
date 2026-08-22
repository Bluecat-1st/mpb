import { contentTypes } from './client.ts';
declare global {
    var contentMap: Partial<Record<keyof typeof contentTypes, string[]>>;
}
export {};