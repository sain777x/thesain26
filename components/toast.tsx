"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "thesain26-toast";

export function queueToast(message: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, message);
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      sessionStorage.removeItem(STORAGE_KEY);
      setMessage(stored);
      window.setTimeout(() => setMessage(null), 4200);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg"
    >
      {message}
    </div>
  );
}
