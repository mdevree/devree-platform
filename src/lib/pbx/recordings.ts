import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
const root = () => process.env.PBX_RECORDING_DIR || path.join(process.cwd(), "uploads/pbx");
export function recordingPath(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Ongeldig opname-ID");
  return path.join(root(), id + ".wav");
}
export function validRecording(data: Buffer) {
  if (data.length <= 44 || data.length > 2100000 || data.toString("ascii",0,4)!=="RIFF" || data.toString("ascii",8,12)!=="WAVE") return false;
  let format=false, audio=false;
  for(let offset=12;offset+8<=data.length;) {
    const type=data.toString("ascii",offset,offset+4), size=data.readUInt32LE(offset+4), body=offset+8;
    if(body+size>data.length)return false;
    if(type==="fmt ")format=size>=16&&data.readUInt16LE(body)===1&&data.readUInt16LE(body+2)===1&&data.readUInt32LE(body+4)===8000&&data.readUInt16LE(body+14)===16;
    if(type==="data")audio=size>0;
    offset=body+size+(size%2);
  }
  return format&&audio;
}
export async function saveRecording(id: string, bytes: Buffer, expectedHash: string) {
  if (!validRecording(bytes) || !/^[a-f0-9]{64}$/.test(expectedHash) || createHash("sha256").update(bytes).digest("hex") !== expectedHash) throw new Error("Opname of checksum ongeldig");
  const row = await prisma.pbxRequest.findUniqueOrThrow({ where: { id }, include: { task: true } });
  if (row.recordingDeletedAt || (row.task?.completedAt && row.task.completedAt.getTime() < Date.now() - 30 * 86400000)) return { expired: true };
  if (row.recordingHash && row.recordingHash !== expectedHash) throw new Error("Een bestaande opname kan niet worden overschreven");
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const tmp = recordingPath(id) + "." + randomUUID() + ".tmp";
  await writeFile(tmp, bytes, { mode: 0o600 });
  await rename(tmp, recordingPath(id));
  await prisma.pbxRequest.update({ where: { id }, data: { recordingHash: expectedHash, recordingBytes: bytes.length } });
  return { stored: true };
}
export async function readRecording(id: string) { return readFile(recordingPath(id)); }
export async function purgeRecordings() {
  const rows = await prisma.pbxRequest.findMany({ where: { recordingHash: { not: null }, recordingDeletedAt: null, task: { status: "afgerond", completedAt: { lt: new Date(Date.now() - 30 * 86400000) } } }, take: 100 });
  for (const row of rows) {
    await unlink(recordingPath(row.id)).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
    await prisma.pbxRequest.update({ where: { id: row.id }, data: { recordingDeletedAt: new Date(), recordingBytes: null } });
  }
  return rows.length;
}
