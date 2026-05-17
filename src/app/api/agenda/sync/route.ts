import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { DateTime } from "luxon";

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
  relation_relationid?: string;
  employee_employeeid?: number;
  medewerker_fullname?: string;
  agmemo?: string;
  agintratext?: string;
  agallday?: boolean;
  aginactive?: boolean;
  alastupd?: string;
}

function parseRwDate(s?: string): Date | null {
  if (!s) return null;
  const dt = DateTime.fromFormat(s, "dd-MM-yyyy HH:mm:ss", { zone: "Europe/Amsterdam" });
  return dt.isValid ? dt.toJSDate() : null;
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
        relationRelationid: item.relation_relationid,
        employeeEmployeeid: item.employee_employeeid,
        medewerkerFullname: item.medewerker_fullname,
        agmemo: item.agmemo,
        agintratext: item.agintratext,
        agallday: item.agallday,
        aginactive: item.aginactive,
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
        relationRelationid: item.relation_relationid,
        employeeEmployeeid: item.employee_employeeid,
        medewerkerFullname: item.medewerker_fullname,
        agmemo: item.agmemo,
        agintratext: item.agintratext,
        agallday: item.agallday,
        aginactive: item.aginactive,
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
