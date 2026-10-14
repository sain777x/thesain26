"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { signOutAction } from "@/lib/actions";

const links = [
  { href: "/painel", label: "Visão geral" },
  { href: "/painel/loja", label: "Loja" },
  { href: "/painel/produtos", label: "Produtos" },
  { href: "/painel/vendas", label: "Vendas" },
  { href: "/painel/saldo", label: "Saldo e saques" },
];

export function SellerNav({ storeSlug }: { storeSlug?: string | null }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {links.map((link) => {
          const active =
            link.href === "/painel"
              ? pathname === "/painel"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
        {storeSlug ? (
          <Link
            href={`/loja/${storeSlug}`}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Ver loja pública
          </Link>
        ) : null}
      </nav>
      <form action={signOutAction} className="hidden lg:block">
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
