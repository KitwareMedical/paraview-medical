import { onDeleted } from './context';

export const watchStore = (store, getter, fn, opts) => {
  const stop = store.watch(getter, fn, opts);
  onDeleted(stop);
};
