import { isRef, effect, stop } from '@vue/reactivity';
import { onBeforeDelete } from './context';

export * from '@vue/reactivity';

/**
 * Observes a source and invokes a callback.
 *
 * Similar to vue.js watch, but for the widgets.
 */
export const observe = (source, callback, options = {}) => {
  let getter = null;
  let isStopped = false;

  if (Array.isArray(source)) {
    getter = () => source.map((src) => (isRef(src) ? src.value : src));
  } else if (isRef(source)) {
    getter = () => source.value;
  } else if (source instanceof Function) {
    getter = source;
  } else {
    throw new Error('Cannot observe the given source');
  }

  let runner = null;
  let oldValue = getter();

  const scheduler = () => {
    const value = runner();
    callback(value, oldValue);
    oldValue = value;
  };

  runner = effect(getter, {
    lazy: true,
    scheduler,
  });

  if (options?.immediate) {
    scheduler();
  } else {
    oldValue = runner();
  }

  const stopObserving = () => {
    if (!isStopped) {
      stop(runner);
      isStopped = true;
    }
  };

  onBeforeDelete(stopObserving);

  return stopObserving;
};
