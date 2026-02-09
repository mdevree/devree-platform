import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
