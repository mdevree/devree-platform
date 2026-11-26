import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { test } from "node:test";
import type { WahaReplyEvent } from "./whatsappReplyEvents";

const testDatabase = process.env.TEST_WHATSAPP_REPLY_DATABASE_URL;

test("WhatsApp-concepten coalesce, blijven per account en worden na een eigen antwoord opgeruimd", {
  skip: !testDatabase,
}, async (t) => {
  const dsn = new URL(testDatabase!);
  assert.ok(["localhost", "127.0.0.1"].includes(dsn.hostname));
  assert.match(dsn.pathname, /^\/(whatsapp_reply_test|devree_wa_contract)(?:_[a-z0-9]+)?$/);
  process.env.DATABASE_URL = testDatabase;
  process.env.MAUTIC_URL = "https://mautic.invalid";
  process.env.WHATSAPP_REPLY_OFFICE_ENABLED = "1";
  process.env.WHATSAPP_REPLY_PERSONAL_ENABLED = "1";
  process.env.WHATSAPP_REPLY_OWNER_USER_ID = "whatsapp-test-user";
  process.env.WHATSAPP_REPLY_OPENAI_API_KEY = "test-local-only";
  process.env.WAHA_PERSONAL_API_URL = "https://personal-waha.invalid";
  process.env.WAHA_PERSONAL_API_KEY = "fixture-personal-key";
  process.env.WAHA_PERSONAL_SESSION = "fixture-personal-session";

  const { prisma } = await import("./prisma");
  const { processWahaReplyEvent, listWhatsAppReplyDraftMessages, editWhatsAppReplyDraft, sendWhatsAppReplyDraft } =
    await import("./whatsappReplies");
  const { processWhatsAppReplyDrafts } = await import("./whatsappReplyWorker");
  const suffix = randomInt(1000000, 9999997);
  const known = `3161${suffix}`;
  const excluded = `3161${suffix + 1}`;
  const unknown = `3161${suffix + 2}`;
  const chatIds = [known, excluded, unknown].map((phone) => `${phone}@c.us`);
  const [chatId, excludedChat, unknownChat] = chatIds;
  const start = Date.now() - 20_000;
  const aiPrompts: string[] = [];
  const personalSends: unknown[] = [];
  let simulateTimeout = false;
  const contacts = new Map([[known, 1], [excluded, 2]]);
  const lookups: number[] = [];
  function mauticContact(id: number) {
    return {
      id,
      fields: { all: { phone: "+" + (id === 1 ? known : excluded), firstname: "Testpersoon" } },
      tags: id === 2 ? [{ tag: "whatsapp-persoonlijk-uitsluiten" }] : [],
    };
  }
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "personal-waha.invalid") {
      assert.equal(url.pathname, "/api/sendText");
      assert.equal(new Headers(init?.headers).get("x-api-key"), "fixture-personal-key");
      personalSends.push(JSON.parse(String(init?.body)));
      if (simulateTimeout) throw new DOMException("Fixture timeout", "AbortError");
      return Response.json({ id: `true_${chatId}_APPROVED` });
    }
    if (url.hostname === "api.openai.com") {
      const payload = JSON.parse(String(init?.body)) as { instructions: string };
      aiPrompts.push(payload.instructions);
      return Response.json({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: JSON.stringify({ body: "Zeker, welke dag past?", summary: "Vraag over een bezichtiging." }) }] }],
      });
    }
    assert.equal(url.hostname, "mautic.invalid");
    if (url.pathname === "/oauth/v2/token") return Response.json({ access_token: "mock-token", expires_in: 3600 });
    assert.equal(init?.method ?? "GET", "GET");
    if (url.pathname === "/api/contacts") {
      const phone = url.searchParams.get("where[0][val][1][val]")?.replace(/^\+/, "");
      const id = phone && contacts.get(phone);
      return Response.json({ contacts: id ? { [id]: mauticContact(id) } : {} });
    }
    const id = Number(url.pathname.split("/").at(-1));
    lookups.push(id);
    return Response.json({ contact: mauticContact(id) });
  });

  function event(id: string, offset: number, type: WahaReplyEvent["type"] = "inbound", peer = chatId): WahaReplyEvent {
    return {
      session: "test",
      chatId: peer,
      providerMessageId: id,
      occurredAt: new Date(start + offset),
      type,
      body: type === "inbound" ? "Testvraag " + id : undefined,
    };
  }
  async function thread(account: string) {
    return prisma.waReplyThread.findFirstOrThrow({ where: { account, chatId } });
  }
  async function active(account: string) {
    return prisma.waReplyDraft.findUniqueOrThrow({ where: { id: (await thread(account)).activeDraftId! } });
  }

  try {
    await Promise.all([
      processWahaReplyEvent("office", event("o1", 1000)),
      processWahaReplyEvent("office", event("o1", 1000)),
      processWahaReplyEvent("office", event("o2", 2000)),
      processWahaReplyEvent("personal", event("p1", 1000)),
    ]);
    await processWahaReplyEvent("personal", event("excluded", 1000, "inbound", excludedChat));
    await processWahaReplyEvent("personal", event("unknown", 1000, "inbound", unknownChat));
    assert.ok(lookups.includes(2));
    assert.equal(await prisma.waReplyThread.count({ where: { chatId: { in: [excludedChat, unknownChat] } } }), 0);

    const office = await active("office");
    let personal = await active("personal");
    assert.notEqual(office.threadId, personal.threadId);
    assert.equal(personal.ownerUserId, "whatsapp-test-user");
    assert.deepEqual((await listWhatsAppReplyDraftMessages(office)).map((m) => m.body), ["Testvraag o1", "Testvraag o2"]);

    await prisma.waReplyDraft.updateMany({
      where: { id: { in: [office.id, personal.id] } },
      data: { nextAttempt: new Date(0) },
    });
    await processWhatsAppReplyDrafts();
    personal = await active("personal");
    assert.equal(personal.status, "ready");
    assert.ok(aiPrompts.some((prompt) => /Melvin.*ik-vorm/.test(prompt)));
    assert.ok(aiPrompts.some((prompt) => /De Vree Makelaardij/.test(prompt)));
    await assert.rejects(editWhatsAppReplyDraft(personal.id, personal.revision, "Andere tekst", "another-user"), { status: 404 });
    const edited = await editWhatsAppReplyDraft(personal.id, personal.revision, "Mijn eigen tekst", "whatsapp-test-user");
    await processWahaReplyEvent("personal", event("p2", 2000));
    const pending = await active("personal");
    assert.equal(pending.body, "Mijn eigen tekst");
    assert.equal(pending.status, "pending");
    assert.equal(pending.readyAt?.getTime(), edited.readyAt?.getTime());
    await assert.rejects(sendWhatsAppReplyDraft(pending.id, edited.revision, "Mijn eigen tekst", "whatsapp-test-user"), { status: 409 });

    await processWahaReplyEvent("personal", event("api", 3000, "api"));
    assert.equal((await active("personal")).id, personal.id);
    await processWahaReplyEvent("personal", event("manual", 3000, "manual"));
    assert.equal((await thread("personal")).activeDraftId, null);
    const closed = await prisma.waReplyDraft.findUniqueOrThrow({ where: { id: personal.id } });
    assert.equal(closed.status, "answered");
    assert.equal(closed.body, null);
    assert.equal(closed.summary, null);
    assert.deepEqual(await listWhatsAppReplyDraftMessages(closed), []);
    assert.equal((await active("office")).id, office.id);

    await processWahaReplyEvent("personal", event("late", 2500));
    assert.equal((await thread("personal")).activeDraftId, null);
    await processWahaReplyEvent("personal", event("p3", 4000));
    assert.notEqual((await active("personal")).id, personal.id);

    async function prepareCurrentPersonal() {
      const item = await active("personal");
      await prisma.waReplyDraft.update({ where: { id: item.id }, data: { nextAttempt: new Date(0) } });
      await processWhatsAppReplyDrafts();
      return active("personal");
    }
    const sendable = await prepareCurrentPersonal();
    const sent = await sendWhatsAppReplyDraft(sendable.id, sendable.revision, "Een goedgekeurd antwoord", "whatsapp-test-user");
    assert.equal(sent.status, "sent");
    assert.equal(sent.providerMessageId, "APPROVED");
    assert.deepEqual(personalSends, [{
      chatId,
      text: "Een goedgekeurd antwoord",
      session: "fixture-personal-session",
    }]);
    assert.equal((await thread("personal")).activeDraftId, null);
    await assert.rejects(sendWhatsAppReplyDraft(sendable.id, sendable.revision, "Een goedgekeurd antwoord", "whatsapp-test-user"), { status: 409 });
    assert.equal(personalSends.length, 1);

    await processWahaReplyEvent("personal", event("p4", 5000));
    const retryable = await prepareCurrentPersonal();
    simulateTimeout = true;
    await assert.rejects(sendWhatsAppReplyDraft(retryable.id, retryable.revision, "Onzekere poging", "whatsapp-test-user"), { status: 503 });
    const uncertain = await active("personal");
    assert.equal(uncertain.status, "uncertain");
    await assert.rejects(sendWhatsAppReplyDraft(uncertain.id, uncertain.revision, "Onzekere poging", "whatsapp-test-user"), { status: 409 });
    assert.equal(personalSends.length, 2);
    await processWahaReplyEvent("personal", event("p5", 6000));
    const next = await active("personal");
    assert.notEqual(next.id, uncertain.id);
    assert.deepEqual((await listWhatsAppReplyDraftMessages(next)).map((message) => message.body), ["Testvraag p5"]);
  } finally {
    await prisma.waReplyThread.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.$disconnect();
  }
});
