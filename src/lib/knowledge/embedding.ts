export function encodeEmbedding(values: number[]): Uint8Array<ArrayBuffer> {
  const array = new Float32Array(values);
  return new Uint8Array(array.buffer.slice(0));
}

export function decodeEmbedding(value: Uint8Array): number[] {
  const copy = Buffer.from(value);
  return Array.from(new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
