export default {
  fetch() {
    return new Response(
      "The hosted vector retrieval benchmark was removed after markdown search matched hybrid recall at 5.",
      { status: 410 },
    );
  },
};
