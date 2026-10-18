import type { en } from "./locales/en.ts";

type Widen<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every locale must have exactly the keys of `en`. */
export type LocaleShape = Widen<typeof en>;
