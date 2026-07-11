export async function verifyWebhook(stripe, body, signature, secret) {
  return stripe.webhooks.constructEvent(body, signature, secret);
}
