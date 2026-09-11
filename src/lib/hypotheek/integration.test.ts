import test from "node:test";
import assert from "node:assert/strict";
test("referral migration and transactional database integration", { skip: process.env.HYPOTHEEK_INTEGRATION !== "1" }, async () => {
    const { prisma } = await import("../prisma");
    const { register, correct, locked, registerInTransaction } = await import("./service");
    try {
        assert.equal(await prisma.hypotheekDoorverwijzing.count(), 4);
        const migrated = await prisma.hypotheekDoorverwijzing.findUniqueOrThrow({ where: { id: "legacy_van_os" } });
        assert.equal(migrated.datum?.toISOString().slice(0, 10), "2026-09-09");
        assert.equal(migrated.hypotheekAfgesloten, false);
        const partner = await prisma.hypotheekAdviseur.findUniqueOrThrow({ where: { id: "willigen" } });
        const input = { adviseurId: partner.id, contacten: [{ naam: "Hoofdcontact", email: "household@example.test", telefoon: "+31612345678" }, { naam: "Partner", email: "partner@example.test" }], datum: "2026-08-17" };
        const [a, b] = await Promise.all([register(input, "test"), register(input, "test")]);
        assert.equal(a.doorverwijzing.id, b.doorverwijzing.id);
        assert.notEqual(a.existing, b.existing);
        assert.equal(await prisma.hypotheekDoorverwijzing.count(), 5);
        assert.equal(a.doorverwijzing.deelnemers.length, 2);
        assert.equal(a.doorverwijzing.deelnemers[0].lead.status, "CONTACT");
        const repeat = await register({ adviseurId: partner.id, contacten: [{ naam: "Andere spelling", telefoon: "06-12345678" }], datum: "2026-09-11" }, "test");
        assert.equal(repeat.existing, true);
        assert.equal(repeat.doorverwijzing.datum?.toISOString().slice(0, 10), "2026-08-17");
        const before = await prisma.lead.count();
        await assert.rejects(locked(async (tx) => { await registerInTransaction(tx, { adviseurId: partner.id, contacten: [{ naam: "Rollback", email: "rollback@example.test" }] }, "test"); throw Error("Injected failure"); }));
        assert.equal(await prisma.lead.count(), before);
        assert.equal(await prisma.hypotheekDoorverwijzing.count(), 5);
        await assert.rejects(register({ adviseurId: partner.id, contacten: [{ leadId: "van_os" }, { naam: "Conflict", email: "conflict@example.test" }] }, "test"));
        assert.equal(await prisma.lead.count(), before);
        await correct(a.doorverwijzing.id, { datum: null, hypotheekAfgesloten: true }, "test");
        const changed = await prisma.hypotheekDoorverwijzing.findUniqueOrThrow({ where: { id: a.doorverwijzing.id } });
        assert.equal(changed.datum, null);
        assert.equal(changed.hypotheekAfgesloten, true);
        assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: a.doorverwijzing.deelnemers[0].leadId } })).hypotheekAfgesloten, true);
        await assert.rejects(prisma.lead.delete({ where: { id: a.doorverwijzing.deelnemers[0].leadId } }));
        for (let i = 0; i < 26; i++)
            await register({ adviseurId: partner.id, contacten: [{ naam: `Paginering ${i}`, email: `page${i}@example.test` }], datum: "2026-09-10" }, "test");
        assert.equal((await prisma.hypotheekDoorverwijzing.findMany({ take: 25 })).length, 25);
        assert.equal((await prisma.hypotheekDoorverwijzing.findMany({ skip: 25, take: 25 })).length, 6);
        const { processMail } = await import("./mail");
        const noRemote = async () => ({ contacts: [], total: 0 });
        await prisma.hypotheekInstelling.update({ where: { id: "default" }, data: { automatisch: true, actiefVanaf: new Date("2026-09-01T00:00:00Z") } });
        const payload = { messageId: "test-mail-1", mailbox: "track@connect.devreemakelaardij.nl", sentAt: "2026-09-11T12:00:00Z", from: "melvin@devreemakelaardij.nl", to: "frans@vwadvies.nl", subject: "Doorverwijzing", textPlain: "Wil jij een afspraak inplannen met Paginering 0? E-mail: page0@example.test" };
        const preview = await processMail({ ...payload, dryRun: true }, noRemote);
        assert.equal("dryRun" in preview && preview.dryRun, true);
        assert.equal(await prisma.hypotheekMailEvent.count(), 0);
        const first = await processMail(payload, noRemote);
        assert.equal("event" in first && first.event?.status, "registered");
        const dup = await processMail(payload, noRemote);
        assert.equal("duplicate" in dup && dup.duplicate, true);
        assert.equal(await prisma.hypotheekMailEvent.count(), 1);
        await processMail({ ...payload, messageId: "test-mail-2" }, noRemote);
        assert.equal(await prisma.hypotheekDoorverwijzing.count(), 31);
        const paged = await prisma.hypotheekDoorverwijzing.findFirstOrThrow({ where: { deelnemers: { some: { lead: { email: "page0@example.test" } } } } });
        assert.equal(paged.datum?.toISOString().slice(0, 10), "2026-09-10");
        const nameOnly = await processMail({ ...payload, messageId: "name-only", textPlain: "Wil jij een afspraak inplannen met familie Rietveld?" }, noRemote);
        assert.equal("event" in nameOnly && nameOnly.event?.status, "review");
        const historical = await processMail({ ...payload, messageId: "historical", sentAt: "2026-08-01T12:00:00Z" }, noRemote);
        assert.equal("event" in historical && historical.event?.status, "review");
        const ambiguous = await processMail({ ...payload, messageId: "ambiguous", textPlain: "Wil jij een afspraak inplannen met page0@example.test en page1@example.test?" }, noRemote);
        assert.equal("event" in ambiguous && ambiguous.event?.status, "review");
        await prisma.hypotheekInstelling.update({ where: { id: "default" }, data: { automatisch: false } });
        const disabled = await processMail({ ...payload, messageId: "disabled" }, noRemote);
        assert.equal("event" in disabled && disabled.event?.status, "review");
    }
    finally {
        await prisma.$disconnect();
    }
});
