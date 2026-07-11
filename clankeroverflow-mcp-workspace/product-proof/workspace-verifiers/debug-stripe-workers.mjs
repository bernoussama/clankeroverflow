import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { verifyWebhook } = await import(
  `${pathToFileURL(join(process.argv[2], "webhook.mjs"))}?verify=${Date.now()}`
);
const rawBody = new Uint8Array([1, 2, 3]);
let call;
const stripe = {
  webhooks: {
    constructEventAsync: async (...args) => {
      call = args;
      return "event";
    },
  },
};
const result = await verifyWebhook(stripe, rawBody, "signature", "secret");
if (result !== "event") throw new Error("Expected async Stripe verification result.");
if (!call || call[0] !== rawBody || call[1] !== "signature" || call[2] !== "secret") {
  throw new Error("Expected constructEventAsync to receive the unmodified raw body and signature.");
}
