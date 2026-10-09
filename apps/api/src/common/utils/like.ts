/** Escapes `%`, `_` and `\` so user input in a LIKE pattern is matched literally. Pair with `ESCAPE '\'`. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');
