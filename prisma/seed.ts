import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ---- Singleton settings row ----
  await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      farmName: "Sparmanik Farm",
      exchangeRate: 10200,
      defaultLocale: "en",
    },
  });

  // ---- Dev user (for sign-in during development) ----
  const devEmail = "dev@sparmanikfarm.local";
  const devPassword = "devpassword";
  const existing = await prisma.user.findUnique({ where: { email: devEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: devEmail,
        name: "Dev User",
        passwordHash: await bcrypt.hash(devPassword, 10),
      },
    });
    console.log(`Seeded dev user: ${devEmail} / ${devPassword}`);
  }

  // ---- Legacy categories (so Inventory has a category picker) ----
  const categories = [
    "Nutrients",
    "Media",
    "Pots",
    "Irrigation",
    "Seeds",
    "Pesticides",
    "Instruments",
    "Lighting",
    "Equipment",
    "Packaging",
    "Tools",
    "Other",
  ];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // NOTE: Full legacy data ingest (items, harvests, staff, suppliers, etc.)
  // happens in Phase 1 when the entity-specific UI is in place. For now we
  // only need the singletons and lookup tables that the app shell touches.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
