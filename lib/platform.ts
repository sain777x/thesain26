import { prisma } from "@/lib/prisma";

export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: "platform" },
    update: {},
    create: { id: "platform", feePercent: 5, name: "thesain26" },
  });
}

export async function feePercentFor(user: { feePercentOverride: number | null }) {
  if (user.feePercentOverride != null) return user.feePercentOverride;
  const settings = await getPlatformSettings();
  return settings.feePercent;
}
