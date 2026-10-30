const CR = 13;
const LF = 10;

/** FNV-1a, 32-bit; `seed` continues an earlier hash. */
export function fnv1a(data: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed;
  for (const b of data) h = step(h, b);
  return h;
}

function step(h: number, b: number) {
  return Math.imul(h ^ b, 0x01000193) >>> 0;
}

/**
 * Counts and hashes a pane's stream. macOS's tty re-sends the CR of an onlcr CRLF when its
 * queue fills, so CRs before a CRLF collapse to one; they are counted, never hidden.
 */
export class StreamCheck {
  private bytes = 0;
  private retriedCr = 0;
  private hash = 0x811c9dc5;
  // CRs seen but not yet hashed: whether they stay depends on the next byte.
  private crs = 0;

  push(chunk: Uint8Array) {
    this.bytes += chunk.byteLength;
    for (const b of chunk) {
      if (b === CR) {
        this.crs++;
        continue;
      }
      if (b === LF && this.crs > 1) {
        this.retriedCr += this.crs - 1;
        this.crs = 1;
      }
      for (; this.crs > 0; this.crs--) this.hash = step(this.hash, CR);
      this.hash = step(this.hash, b);
    }
  }

  result(): { bytes: number; retriedCr: number; hash: number } {
    let hash = this.hash;
    for (let i = 0; i < this.crs; i++) hash = step(hash, CR);
    return { bytes: this.bytes, retriedCr: this.retriedCr, hash };
  }
}
