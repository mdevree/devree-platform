import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

interface RealworksItem {
  systemid: number;
  agowner?: string;
  agcode?: string;
  agdescr?: string;
  agtype?: string;
  agstatus?: string;
  agbegin?: string;
  agend?: string;
  aglocation?: string;
  agobjcode?: string;
  agrcode?: string;
  relation_relationid?: string | number;
  employee_employeeid?: number;
  medewerker_fullname?: string;
  agmemo?: string;
  agintratext?: string;
  agallday?: boolean | number | string | null;
  aginactive?: boolean | number | string | null;
  alastupd?: string;
}

// Parset "DD-MM-YYYY HH:mm:ss" (Amsterdam tijd) naar Date
function parseRwDate(s?: string): Date | null {
  if (!s) return null;
  const [datePart, timePart] = s.split(" ");
  if (!datePart || !timePart) return null;
  const [day, month, year] = datePart.split("-");
  return new Date(`${year}-${month}-${day}T${timePart}+02:00`);
}

function boolOrNull(value: boolean | number | string | null | undefined): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = value.toLowerCase().trim();
  if (["1", "true", "ja", "yes"].includes(normalized)) return true;
  if (["0", "false", "nee", "no"].includes(normalized)) return false;
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const body = await req.json();
  const items: RealworksItem[] = body.agenda ?? body;

  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ changed: [] });

  // Haal bestaande records op voor deze systemids
  const systemids = items.map((i) => i.systemid);
  const existing = await prisma.agendaAfspraak.findMany({
    where: { systemid: { in: systemids } },
    select: { systemid: true, alastupd: true, gcalEventId: true },
  });
  const existingMap = new Map(existing.map((e) => [e.systemid, e]));

  const changed: RealworksItem[] = [];

  for (const item of items) {
    const prev = existingMap.get(item.systemid);
    const isNew = !prev;
    const isUpdated = prev && prev.alastupd !== item.alastupd;

    if (isNew || isUpdated) changed.push(item);

    await prisma.agendaAfspraak.upsert({
      where: { systemid: item.systemid },
      create: {
        systemid: item.systemid,
        agowner: item.agowner,
        agcode: item.agcode,
        agdescr: item.agdescr,
        agtype: item.agtype,
        agstatus: item.agstatus,
        agbegin: parseRwDate(item.agbegin),
        agend: parseRwDate(item.agend),
        aglocation: item.aglocation,
        agobjcode: item.agobjcode,
        agrcode: item.agrcode,
        relationRelationid: item.relation_relationid != null ? String(item.relation_relationid) : null,
        employeeEmployeeid: item.employee_employeeid,
        medewerkerFullname: item.medewerker_fullname,
        agmemo: item.agmemo,
        agintratext: item.agintratext,
        agallday: boolOrNull(item.agallday),
        aginactive: boolOrNull(item.aginactive),
        alastupd: item.alastupd,
      },
      update: {
        agowner: item.agowner,
        agcode: item.agcode,
        agdescr: item.agdescr,
        agtype: item.agtype,
        agstatus: item.agstatus,
        agbegin: parseRwDate(item.agbegin),
        agend: parseRwDate(item.agend),
        aglocation: item.aglocation,
        agobjcode: item.agobjcode,
        agrcode: item.agrcode,
        relationRelationid: item.relation_relationid != null ? String(item.relation_relationid) : null,
        employeeEmployeeid: item.employee_employeeid,
        medewerkerFullname: item.medewerker_fullname,
        agmemo: item.agmemo,
        agintratext: item.agintratext,
        agallday: boolOrNull(item.agallday),
        aginactive: boolOrNull(item.aginactive),
        alastupd: item.alastupd,
      },
    });
  }

  return NextResponse.json({
    received: items.length,
    changed: changed.length,
    items: changed,
  });
}
