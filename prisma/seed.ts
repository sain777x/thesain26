import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.platformSettings.upsert({
    where: { id: "platform" },
    update: {},
    create: { id: "platform", feePercent: 5, name: "thesain26" },
  });

  const email = (
    process.env.PLATFORM_OWNER_EMAIL || "dono@thesain26.com"
  ).toLowerCase();
  const password = process.env.PLATFORM_OWNER_PASSWORD || "";
  const name = process.env.PLATFORM_OWNER_NAME || "Dono thesain26";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { role: "owner", name },
    create: {
      email,
      name,
      passwordHash,
      role: "owner",
    },
  });

  console.log(`Dono da thesain26 pronto: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
