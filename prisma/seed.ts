import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_AGENT_PROFILE = {
  slug: "digitale-medewerker-devree",
  displayName: "Digitale medewerker De Vree Makelaardij",
  roleDescription:
    "Digitale assistent van De Vree Makelaardij die namens het kantoor opvolging doet, klantvragen inventariseert en concept-opvolging klaarzet.",
  toneOfVoice:
    "Rustig, vriendelijk, concreet, transparant digitaal en professioneel. Altijd spreken namens De Vree Makelaardij.",
  basePrompt:
    "Je bent de digitale medewerker van De Vree Makelaardij in Spijkenisse. Je helpt namens het kantoor met korte opvolging, vragen inventariseren en juiste informatie klaarzetten. Je doet geen harde toezeggingen, technische adviezen, juridische adviezen of afspraken zonder menselijke bevestiging.",
  rules: [
    "Zeg altijd De Vree Makelaardij, nooit alleen De Vree.",
    "Stel maximaal een vraag tegelijk.",
    "Vat samen en vraag: Klopt dit zo?",
    "Gebruik geen algemene aanbodlink als specifieke woninglink.",
  ],
  forbiddenCommitments: [
    "Ik stuur u dit direct toe.",
    "Wij bellen u op een exact tijdstip terug.",
    "Er is een afspraak ingepland.",
  ],
  domainVocabulary: ["Kwaaitaalvloer", "kwijtaalvloer", "betonrot", "biedtermijn", "VvE", "MJOP"],
};

const DEFAULT_AGENT_TASK = {
  slug: "bezichtiging_nabellen",
  displayName: "Bezichtiging nabellen",
  description: "Korte telefonische opvolging na een bezichtiging.",
  goal:
    "Achterhaal de algemene indruk, interesse, belangrijkste twijfel of vraag, en zet concrete opvolging klaar voor een collega.",
  channel: "call",
  questions: [
    "Komt het uit dat ik kort bel?",
    "Wat was uw algemene indruk van de woning?",
    "Is de woning nog interessant voor u: ja, nee of misschien?",
    "Wat is op dit moment uw belangrijkste twijfel of vraag?",
    "Klopt mijn samenvatting zo?",
  ],
  allowedActions: [
    "klantvraag noteren",
    "terugbelverzoek noteren",
    "goedgekeurde link signaleren",
    "WhatsApp-concept laten maken",
    "info-mail naar kantoor laten sturen",
  ],
  followUpPolicy: {
    callsRequireBelApproval: true,
    outboundMessagesAreDrafts: true,
    noAutomaticSending: true,
  },
};

async function main() {
  console.log("Seeding database...");

  // Maak standaard gebruikers aan
  const users = [
    {
      name: "Melvin de Vree",
      email: "melvin@devreemakelaardij.nl",
      password: await bcrypt.hash("welkom123", 10),
      role: "manager",
    },
    {
      name: "Erling de Vree",
      email: "erling@devreemakelaardij.nl",
      password: await bcrypt.hash("welkom123", 10),
      role: "manager",
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
    console.log(`  Gebruiker aangemaakt: ${user.name} (${user.role})`);
  }

  await prisma.aiAgentProfile.upsert({
    where: { slug: DEFAULT_AGENT_PROFILE.slug },
    update: {
      displayName: DEFAULT_AGENT_PROFILE.displayName,
      roleDescription: DEFAULT_AGENT_PROFILE.roleDescription,
      toneOfVoice: DEFAULT_AGENT_PROFILE.toneOfVoice,
      active: true,
      isDefault: true,
    },
    create: {
      ...DEFAULT_AGENT_PROFILE,
      active: true,
      isDefault: true,
    },
  });
  console.log("  Agentprofiel aangemaakt: Digitale medewerker");

  await prisma.aiAgentTask.upsert({
    where: { slug: DEFAULT_AGENT_TASK.slug },
    update: {
      displayName: DEFAULT_AGENT_TASK.displayName,
      description: DEFAULT_AGENT_TASK.description,
      goal: DEFAULT_AGENT_TASK.goal,
      channel: DEFAULT_AGENT_TASK.channel,
      active: true,
      isDefault: true,
    },
    create: {
      ...DEFAULT_AGENT_TASK,
      active: true,
      isDefault: true,
    },
  });
  console.log("  Agenttaak aangemaakt: Bezichtiging nabellen");

  console.log("\nSeed voltooid!");
  console.log("BELANGRIJK: Wijzig de standaard wachtwoorden na eerste login!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
