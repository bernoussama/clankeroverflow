import { pathToFileURL } from "node:url";

const { verifyWebhook } = await import(`${pathToFileURL("webhook.mjs")}?test=${Date.now()}`);
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
if ((await verifyWebhook(stripe, rawBody, "signature", "secret")) !== "event")
  throw new Error("Async verification result was not returned.");
if (!call || call[0] !== rawBody || call[1] !== "signature" || call[2] !== "secret") {
  throw new Error("Webhook verification did not preserve the raw request body and signature.");
}
