/* Is an MP4's `moov` atom before its `mdat`? (feature 10). If so, a
   browser can start playing and seeking before the whole file arrives and
   the faststart remux can be skipped. Reads only the top-level box headers
   (8–16 bytes each) through `read`, so a 2 GB file is never loaded. */

export type ReadAt = (position: number, length: number) => Promise<Uint8Array>;

export async function moovBeforeMdat(read: ReadAt, fileSize: number): Promise<boolean | null> {
  let pos = 0;
  while (pos + 8 <= fileSize) {
    const head = await read(pos, 16);
    if (head.length < 8) return null;
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (size === 1) {
      if (head.length < 16) return null;
      // 64-bit size; files here are < 2^53 bytes.
      size = view.getUint32(8) * 2 ** 32 + view.getUint32(12);
    } else if (size === 0) {
      size = fileSize - pos; // box runs to end of file
    }
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size < 8) return null; // corrupt
    pos += size;
  }
  return null; // neither found
}
