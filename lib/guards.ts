import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { whopErrorMessage } from "@/lib/whop";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "Faça login para continuar.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { store: true },
  });
  if (!user) {
    throw new HttpError(401, "Sessão inválida. Entre de novo.");
  }
  return user;
}

export async function requireSeller() {
  const user = await requireUser();
  if (user.role !== "seller" && user.role !== "owner") {
    throw new HttpError(403, "Esta área é só de vendedores.");
  }
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "owner") {
    throw new HttpError(403, "Só o dono da thesain26 acessa este painel.");
  }
  return user;
}

export function toErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[thesain26]", error);
  return NextResponse.json(
    { error: whopErrorMessage(error) },
    { status: 502 },
  );
}
