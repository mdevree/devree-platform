import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pbxServiceAuthorized } from "@/lib/pbx/auth";
import { saveRecording, readRecording } from "@/lib/pbx/recordings";
export async function POST(req: Request, { params }: { params: Promise<{ id:string }> }) {
  if (!pbxServiceAuthorized(req)) return new Response(null,{status:401});
  const length = Number(req.headers.get("content-length"));
  if (!length || length > 2100000) return new Response(null,{status:413});
  try { return NextResponse.json(await saveRecording((await params).id, Buffer.from(await req.arrayBuffer()), req.headers.get("x-content-sha256") || "")); }
  catch { return NextResponse.json({error:"Opname niet opgeslagen"},{status:400}); }
}
export async function GET(_req: Request, { params }: { params: Promise<{ id:string }> }) {
  if (!await auth()) return new Response(null,{status:401});
  const {id}=await params;
  const row=await prisma.pbxRequest.findUnique({where:{id},include:{task:true}});
  if (!row?.recordingHash || row.recordingDeletedAt || (row.task?.status === "afgerond" && row.task.completedAt && row.task.completedAt.getTime() < Date.now()-30*86400000)) return new Response(null,{status:404});
  try {
    const data=await readRecording(id);
    return new Response(new Uint8Array(data),{headers:{"Content-Type":"audio/wav","Content-Length":String(data.length),"Cache-Control":"private, no-store","Content-Disposition":'inline; filename="toelichting.wav"'}});
  } catch { return new Response(null,{status:404}); }
}
