import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/taken/webhook
 * Ontvang taken data van n8n (Notion sync)
 * Acties: create, update, delete
 */
export async function POST(request: NextRequest) {
  try {
    // Webhook secret verificatie
    const webhookSecret = request.headers.get("x-webhook-secret");
    if (
      process.env.N8N_WEBHOOK_SECRET &&
      webhookSecret !== process.env.N8N_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const data = payload.body || payload;

    const action = data.action;
    if (!action || !["create", "update", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "action is verplicht (create/update/delete)" },
        { status: 400 }
      );
    }

    // Resolve assignee email naar user ID
    let assigneeId: string | null = null;
    if (data.assigneeEmail) {
      const user = await prisma.user.findUnique({
        where: { email: data.assigneeEmail },
      });
      if (!user) {
        return NextResponse.json(
          { error: `Gebruiker niet gevonden: ${data.assigneeEmail}` },
          { status: 400 }
        );
      }
      assigneeId = user.id;
    }

    // Resolve project notionPageId naar project ID
    let projectId: string | null = null;
    if (data.projectNotionPageId) {
      const project = await prisma.project.findUnique({
        where: { notionPageId: data.projectNotionPageId },
      });
      if (project) {
        projectId = project.id;
      }
    } else if (data.projectId) {
      projectId = data.projectId;
    }

    // CREATE
    if (action === "create") {
      if (!data.title) {
        return NextResponse.json(
          { error: "title is verplicht bij create" },
          { status: 400 }
        );
      }

      // Als er geen assignee is, pak de eerste manager
      if (!assigneeId) {
        const defaultUser = await prisma.user.findFirst({
          where: { role: "manager", active: true },
        });
        if (!defaultUser) {
          return NextResponse.json(
            { error: "Geen standaard gebruiker gevonden" },
            { status: 400 }
          );
        }
        assigneeId = defaultUser.id;
      }

      // Upsert op basis van notionPageId als dat meegegeven is
      if (data.notionPageId) {
        const task = await prisma.task.upsert({
          where: { id: "nonexistent" }, // Prisma vereist een unique field
          update: {
            title: data.title,
            description: data.description || null,
            status: data.status || undefined,
            priority: data.priority || undefined,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            category: data.category || undefined,
            assigneeId: assigneeId || undefined,
            projectId: projectId || undefined,
          },
          create: {
            title: data.title,
            description: data.description || null,
            status: data.status || "open",
            priority: data.priority || "normaal",
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
            category: data.category || null,
            assigneeId: assigneeId,
            creatorId: assigneeId, // Webhook taken: creator = assignee
            projectId,
            notionPageId: data.notionPageId,
          },
        });

        return NextResponse.json({ success: true, task: { id: task.id }, action: "created" }, { status: 201 });
      }

      // Zoek bestaande taak op notionPageId voor upsert
      let existingTask = null;
      if (data.notionPageId) {
        existingTask = await prisma.task.findFirst({
          where: { notionPageId: data.notionPageId },
        });
      }

      if (existingTask) {
        // Update bestaande taak
        const task = await prisma.task.update({
          where: { id: existingTask.id },
          data: {
            title: data.title || undefined,
            description: data.description !== undefined ? data.description : undefined,
            status: data.status || undefined,
            priority: data.priority || undefined,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            category: data.category || undefined,
            assigneeId: assigneeId || undefined,
            projectId: projectId !== null ? projectId : undefined,
          },
        });
        return NextResponse.json({ success: true, task: { id: task.id }, action: "updated" });
      }

      const task = await prisma.task.create({
        data: {
          title: data.title,
          description: data.description || null,
          status: data.status || "open",
          priority: data.priority || "normaal",
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          category: data.category || null,
          assigneeId: assigneeId,
          creatorId: assigneeId,
          projectId,
          notionPageId: data.notionPageId || null,
        },
      });

      return NextResponse.json({ success: true, task: { id: task.id }, action: "created" }, { status: 201 });
    }

    // UPDATE
    if (action === "update") {
      // Zoek taak op ID of notionPageId
      let task = null;
      if (data.id) {
        task = await prisma.task.findUnique({ where: { id: data.id } });
      } else if (data.notionPageId) {
        task = await prisma.task.findFirst({
          where: { notionPageId: data.notionPageId },
        });
      }

      if (!task) {
        return NextResponse.json(
          { error: "Taak niet gevonden" },
          { status: 404 }
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      if (assigneeId) updateData.assigneeId = assigneeId;
      if (projectId !== null) updateData.projectId = projectId;

      if (data.status !== undefined) {
        updateData.status = data.status;
        if (data.status === "afgerond") {
          updateData.completedAt = new Date();
        } else {
          updateData.completedAt = null;
        }
      }

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: updateData,
      });

      return NextResponse.json({ success: true, task: { id: updated.id }, action: "updated" });
    }

    // DELETE
    if (action === "delete") {
      let task = null;
      if (data.id) {
        task = await prisma.task.findUnique({ where: { id: data.id } });
      } else if (data.notionPageId) {
        task = await prisma.task.findFirst({
          where: { notionPageId: data.notionPageId },
        });
      }

      if (!task) {
        return NextResponse.json(
          { error: "Taak niet gevonden" },
          { status: 404 }
        );
      }

      await prisma.task.delete({ where: { id: task.id } });

      return NextResponse.json({ success: true, action: "deleted" });
    }

    return NextResponse.json({ error: "Ongeldige actie" }, { status: 400 });
  } catch (error) {
    console.error("Taken webhook fout:", error);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
