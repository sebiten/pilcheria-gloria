import webPush from "web-push";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const keys = webPush.generateVAPIDKeys();
const target = resolve(process.cwd(), ".vapid-keys.local");
writeFileSync(
  target,
  [
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    "VAPID_SUBJECT=mailto:sebaburgos9@gmail.com",
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 }
);
console.log(`Claves creadas en ${target}`);
