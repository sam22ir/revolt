/**
 * Wraps a DOM write so it runs only when the value differs from the last one written. A frame with no change
 * then touches no DOM, which matters for `hidden` (the HUD inset observer reacts to it) and for style transforms
 * (a write invalidates layout). The first call always writes.
 */
export const writeOnChange = <T>(apply: (value: T) => void): ((value: T) => void) => {
  let written = false;
  let last: T | undefined;
  return (value) => {
    if (written && Object.is(last, value)) return;
    written = true;
    last = value;
    apply(value);
  };
};
