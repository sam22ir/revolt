/** Small DOM helpers for the gallery. */

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** A titled section with an optional one-line note. */
export const section = (title: string, note?: string): HTMLElement => {
  const s = el("section");
  s.append(el("h2", "", title));
  if (note !== undefined) s.append(el("p", "note", note));
  return s;
};

/** A grid cell: a figure with its media on a stage and a caption under it. */
export const cell = (media: Node, caption: Node[]): HTMLElement => {
  const f = el("figure", "cell");
  const stage = el("div", "stage");
  stage.append(media);
  const figcaption = el("figcaption");
  figcaption.append(...caption);
  f.append(stage, figcaption);
  return f;
};
