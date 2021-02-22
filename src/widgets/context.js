let currentContext = null;

export function createContext() {
  const context = {
    insideHook: false,
    hooks: {},

    invokeHook: (hookName, ...args) => {
      if (hookName in context.hooks) {
        if (context.insideHook) {
          throw new Error('Cannot invoke a hook inside another hook');
        }
        context.insideHook = true;
        const ret = context.hooks[hookName].map((fn) => fn(...args));
        context.insideHook = false;
        return ret;
      }
      return [];
    },
  };

  return context;
}

export function openContext(context) {
  if (currentContext !== null) {
    throw new Error('Cannot open context: there is an existing context');
  }
  currentContext = context;
}

export function getCurrentContext(opts = { required: false }) {
  if (opts?.required && !currentContext) {
    throw new Error(
      'Cannot get current context outside of a context-managed setup.'
    );
  }
  return currentContext;
}

export function closeCurrentContext() {
  currentContext = null;
}

function createHook(name) {
  return (func) => {
    const ctxt = getCurrentContext({ required: true });
    ctxt.hooks[name] = ctxt.hooks[name] ?? [];
    ctxt.hooks[name].push(func);
  };
}

/**
 * Called before a widget is added to a view.
 *
 * This is can be used to determine if a widget should be added.
 * The hook function may return false to not add the widget to a view,
 * or true to add it to the view. If the function returns nothing,
 * then the widget will be added to the view.
 *
 * The hook function receives the following arguments:
 * - view (vtkViewProxy): the associated view
 * - viewType: the view type
 * - widgetState: the widget state
 *
 *
 * @param {Function} hookFunc
 */
export const onBeforeAddToView = createHook('beforeAddToView');

/**
 * Called when a widget is added to a view.
 *
 * The hook function receives the following arguments:
 * - viewWidget: the corresponding view widget
 * - view (vtkViewProxy): the associated view
 * - viewType: the view type
 * - widgetState: the widget state
 *
 * @param {Function} hookFunc
 *
 */
export const onAddedToView = createHook('addedToView');

/**
 * Called when a widget is removed from a view.
 *
 * The hook function receives the following arguments:
 * - view (vtkViewProxy): the associated view
 * - viewType: the view type
 * - viewWidget: the view widget
 * - widgetState: the widget state
 *
 * @param {Function} hookFunc
 */
export const onBeforeRemoveFromView = createHook('beforeRemoveFromView');

/**
 * Called when a widget is removed from a view.
 *
 * The hook function receives the following arguments:
 * - view (vtkViewProxy): the associated view
 * - viewType: the view type
 * - widgetState: the widget state
 *
 * @param {Function} hookFunc
 */
export const onRemovedFromView = createHook('removedFromView');

/**
 * Called before a widget is focused.
 *
 * If any callback returns false, then the widget is not focused
 * for that paticular view.
 *
 * Hook function args:
 * - viewWidget
 * - view
 * - viewType
 * - widgetState
 */
export const onBeforeFocus = createHook('beforeFocus');

/**
 * Called when a widget is focused.
 *
 * Hook function args:
 * - view
 * - viewType
 * - widgetState
 */
export const onFocus = createHook('focused');

/**
 * Called when a widget is unfocused.
 *
 * Hook function args:
 * - viewWidget
 * - view
 * - viewType
 * - widgetState
 */
export const onUnFocus = createHook('unFocused');

/**
 * Called before a widget is deleted.
 * - widgetState
 */
export const onBeforeDelete = createHook('beforeDelete');

/**
 * Called after a widget is deleted.
 */
export const onDeleted = createHook('deleted');

/**
 * Called when a view event occurs.
 *
 * The hook function receives the following arguments:
 * - type (string): event type
 * - event (Event): the event obj
 * - view (vtkViewProxy): the associated view
 * - viewWidget: the widget for the current view
 * - widgetState: the widget state
 *
 * @param {Function} hookFunc
 */
export const onViewMouseEvent = createHook('viewMouseEvent');

/**
 * Called when the widget state changes.
 *
 * The hook function receives the following arguments:
 * - widgetState: the widget state
 *
 * @param {Function} hookFunc
 */
export const onWidgetStateChanged = createHook('widgetStateChanged');
