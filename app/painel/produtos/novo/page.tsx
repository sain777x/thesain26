import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm } from "@/components/product-form";

export const dynamic = "force-dynamic";

export default function NovoProdutoPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Catálogo</p>
        <h1 className="text-4xl">Novo produto</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>O que você está vendendo</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm />
        </CardContent>
      </Card>
    </div>
  );
}
