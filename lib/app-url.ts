export function appUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://127.0.0.1:43123";
  return raw.replace(/\/$/, "");
}
