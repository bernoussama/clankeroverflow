export const mutation = {
  onMutate: async (next) => {
    cache.set(next.id, next);
  },
  onError: () => {
    cache.invalidate();
  },
};
