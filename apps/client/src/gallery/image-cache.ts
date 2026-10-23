const images = new Map<string, Promise<HTMLImageElement>>();

/** Loads and decodes an image once per URL, so canvases can draw it synchronously after the promise resolves. */
export const loadImage = (url: string): Promise<HTMLImageElement> => {
  let pending = images.get(url);
  if (pending === undefined) {
    const img = new Image();
    img.src = url;
    pending = img.decode().then(() => img);
    images.set(url, pending);
  }
  return pending;
};
