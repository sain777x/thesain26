import { notFound } from "next/navigation";
import { CopyCheckoutLink } from "@/components/copy-checkout-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm } from "@/components/product-form";
import { checkoutShareUrl, requestOrigin } from "@/lib/checkout-link";
import { requireSeller } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireSeller();
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, sellerId: user.id },
  });
  if (!product) notFound();
  const checkoutUrl = checkoutShareUrl(await requestOrigin(), product.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Catálogo</p>
        <h1 className="text-4xl">Editar produto</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Checkout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyCheckoutLink url={checkoutUrl} />
          {product.whopPurchaseUrl ? (
            <p className="break-all text-xs text-muted-foreground">
              Whop: {product.whopPurchaseUrl}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{product.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            product={{
              id: product.id,
              name: product.name,
              description: product.description,
              price: product.price,
              imageUrl: product.imageUrl ?? "",
              active: product.active,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
