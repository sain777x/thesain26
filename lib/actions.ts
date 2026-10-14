"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";

export async function signOutAction() {
  // signOut limpa o cookie da sessão. O redirect interno do Auth.js usa a URL
  // absoluta de NEXTAUTH_URL (127.0.0.1), então o navegador sai do host atual.
  // Encerramos a sessão sem esse redirect e voltamos para a página inicial.
  await signOut({ redirect: false });
  redirect("/");
}
