"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

const copyScript = `
document.querySelectorAll("[data-copy-checkout]").forEach(function (button) {
  if (button.dataset.bound) return;
  button.dataset.bound = "1";
  button.addEventListener("click", function () {
    var input = button.parentElement.querySelector("input");
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(function () {
      button.textContent = "Copiado";
      setTimeout(function () { button.textContent = "Copiar"; }, 2000);
    }).catch(function () {
      input.focus();
      input.select();
    });
  });
});
`;

export function CopyCheckoutLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground">Link de checkout</p>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          readOnly
          value={url}
          aria-label="Link de checkout"
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
        <button
          type="button"
          data-copy-checkout=""
          className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0 px-4")}
          onClick={() => void copy()}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {failed ? (
        <p className="text-xs text-muted-foreground">
          Selecione o link e copie manualmente.
        </p>
      ) : null}
      <script dangerouslySetInnerHTML={{ __html: copyScript }} />
    </div>
  );
}
