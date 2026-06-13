import webpush from "web-push";

let configured = false;

// Lazily configure web-push with VAPID details. Returns false if keys
// aren't set so callers can surface a clear message instead of throwing.
export function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:placeholder@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export { webpush };
