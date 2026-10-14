import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreForm } from "@/components/store-form";
import { requireSeller } from "@/lib/guards";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LojaEditorPage() {
  const user = await requireSeller();
  if (!user.store) redirect("/painel");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Sua vitrine</p>
        <h1 className="text-4xl">Loja</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nome, endereço e cores</CardTitle>
        </CardHeader>
        <CardContent>
          <StoreForm
            store={{
              name: user.store.name,
              slug: user.store.slug,
              description: user.store.description,
              logoUrl: user.store.logoUrl ?? "",
              primaryColor: user.store.primaryColor,
              accentColor: user.store.accentColor,
              published: user.store.published,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
