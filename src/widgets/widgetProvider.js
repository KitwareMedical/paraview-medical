import PaintWidget from '@/src/widgets/paint';
import RulerWidget from '@/src/widgets/newRuler';
import CrosshairsWidget from '@/src/widgets/slicingCrosshairs';
import { createContext, openContext, closeCurrentContext } from './context';

export const DEFAULT_NAME_LOOKUP = {
  Paint: PaintWidget,
  Ruler: RulerWidget,
  Crosshairs: CrosshairsWidget,
};

function generateHookArgs(widget, view = null, viewTypeMap = null) {
  const args = {
    id: widget.id,
    widgetState: widget.factory.getWidgetState(),
  };

  if (view) {
    args.view = view;
    if (widget.instances.has(view)) {
      args.viewWidget = widget.instances.get(view);
    }
  }
  if (viewTypeMap && viewTypeMap.has(view)) {
    args.viewType = viewTypeMap.get(view);
  }

  return args;
}

function withWidgetManager(view, handler) {
  const wm = view.getReferenceByName('widgetManager');
  if (wm) {
    handler(wm);
  }
}

function watchView(view, { onMouseEnter, onMouseMove, onMouseLeave }) {
  let container = null;

  const setContainer = (c) => {
    if (container) {
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container = null;
    }

    if (c) {
      container = c;
      container.addEventListener('mouseenter', onMouseEnter);
      container.addEventListener('mousemove', onMouseMove);
      container.addEventListener('mouseleave', onMouseLeave);
    }
  };

  const modSub = view.onModified(() => {
    if (view.getContainer() !== container) {
      setContainer(view.getContainer());
    }
  });

  setContainer(view.getContainer());

  return {
    unsubscribe() {
      modSub.unsubscribe();
      setContainer(null);
    },
  };
}

function onViewEvent(type, event, view) {
  Array.from(this.widgetMap.values()).forEach((widget) => {
    if (widget.instances.has(view)) {
      widget.context.invokeHook('viewMouseEvent', {
        ...generateHookArgs(widget, view, this.viewTypes),
        type,
        event,
      });
    }
  });
}

function addWidgetToView(widget, view) {
  withWidgetManager(view, (wm) => {
    const flags = widget.context.invokeHook(
      'beforeAddToView',
      generateHookArgs(widget, view, this.viewTypes)
    );

    if (flags.some((fl) => fl === false)) {
      return;
    }

    const viewWidget = wm.addWidget(widget.factory, this.viewTypes);
    widget.instances.set(view, viewWidget);

    widget.context.invokeHook(
      'addedToView',
      generateHookArgs(widget, view, this.viewTypes)
    );
  });
}

function removeWidgetFromView(widget, view) {
  withWidgetManager(view, (wm) => {
    widget.context.invokeHook(
      'beforeRemoveToView',
      generateHookArgs(widget, view, this.viewTypes)
    );

    wm.removeWidget(widget.factory);
    widget.instances.delete(view);

    widget.context.invokeHook(
      'removedToView',
      generateHookArgs(widget, view, this.viewTypes)
    );
  });
}

// Merges objects together.
// If there are overlapping keys, throw an error.
function mergeExclusive(...objects) {
  return objects.reduce((acc, obj) => {
    const keys = new Set(Object.keys(acc));
    const overlap = !!Object.keys(obj).find((okey) => keys.has(okey));
    if (overlap) {
      throw new Error('Cannot merge objects: keys are non-exclusive');
    }
    return { ...acc, ...obj };
  }, {});
}

export default class WidgetProvider {
  constructor(store, typeLookup = DEFAULT_NAME_LOOKUP) {
    this.store = store;
    this.typeLookup = typeLookup;
    this.widgetMap = new Map();
    this.nextID = 1;
    this.views = [];
    this.viewTypes = new Map();
    this.viewSubs = new Map();
  }

  getById(id) {
    return this.widgetMap.get(id);
  }

  filterByType(type) {
    return Array.from(this.widgetMap.values()).filter(
      (widget) => widget.type === type
    );
  }

  createWidget(type, options) {
    if (type in this.typeLookup) {
      const id = this.nextID;
      const WidgetConstructor = this.typeLookup[type];
      const widgetInstances = new Map(); // view -> viewWidget (i.e. instance)

      const context = createContext();
      openContext(context);

      const { factory, serialize, ...other } = WidgetConstructor.setup({
        store: this.store,
        initialState: options?.initialState,
        viewTypeMap: this.viewTypes,
        widgetInstances,
        // setTimeout will allow these functions to trigger
        // post-creation.
        deleteSelf: () => setTimeout(() => this.deleteWidget(id)),
        unfocusSelf: () => setTimeout(() => this.focusWidget(id)),
        focusSelf: () => setTimeout(() => this.unfocusWidget(id)),
      });

      closeCurrentContext();

      const widget = mergeExclusive(other, {
        type,
        id,
        factory,
        context,
        instances: widgetInstances,
        serialize,
        subscriptions: [],
      });
      this.widgetMap.set(id, widget);

      const widgetState = factory.getWidgetState();

      widget.subscriptions.push(
        widgetState.onModified(() =>
          // handle condition where state is modified inside a hook
          setTimeout(() => {
            if (widget.context) {
              widget.context.invokeHook('widgetStateChanged', {
                widgetState,
                widgetFactory: factory,
              });
            }
          })
        )
      );

      this.addWidgetToViews(id);

      this.nextID += 1;
      return widget;
    }
    throw new Error(`Could not find widget ${type}`);
  }

  addWidgetToViews(id) {
    const widget = this.widgetMap.get(id);
    if (widget) {
      this.views.forEach((view) => addWidgetToView.bind(this)(widget, view));
    }
  }

  removeWidgetFromViews(id) {
    const widget = this.widgetMap.get(id);
    if (widget) {
      this.views.forEach((view) =>
        removeWidgetFromView.bind(this)(widget, view)
      );
    }
  }

  focusWidget(id) {
    const widget = this.widgetMap.get(id);
    if (widget) {
      this.views.forEach((view) =>
        withWidgetManager(view, (wm) => {
          const viewWidget = widget.instances.get(view);

          const flags = widget.context.invokeHook(
            'beforeFocus',
            generateHookArgs(widget, view, this.viewTypes)
          );

          if (flags.some((fl) => fl === false)) {
            return;
          }

          wm.grabFocus(viewWidget);

          widget.context.invokeHook(
            'focused',
            generateHookArgs(widget, view, this.viewTypes)
          );
        })
      );

      this.store.dispatch('widgets/focusWidget', id);
    }
  }

  unfocus() {
    this.views.forEach((view) =>
      withWidgetManager(view, (wm) => {
        wm.releaseFocus();
        const it = this.widgetMap.values();
        let { value: widget, done } = it.next();
        while (!done) {
          if (widget.instances.has(view)) {
            widget.context.invokeHook(
              'unFocused',
              generateHookArgs(widget, view, this.viewTypes)
            );
          }
          ({ value: widget, done } = it.next());
        }
      })
    );

    this.store.dispatch('widgets/unfocusActiveWidget');
  }

  deleteWidget(id) {
    const widget = this.widgetMap.get(id);
    if (widget) {
      while (widget.subscriptions.length) {
        widget.subscriptions.pop().unsubscribe();
      }

      this.removeWidgetFromViews(id);
      widget.context.invokeHook('beforeDelete');
      this.widgetMap.delete(id);
      widget.context.invokeHook('deleted');
      widget.instances = null;
      widget.factory = null;
      widget.context = null;
    }
  }

  addView(view, viewType) {
    if (this.views.includes(view)) {
      return;
    }
    this.views.push(view);
    this.viewTypes.set(view, viewType);
    this.viewSubs.set(
      view,
      watchView(view, {
        onMouseEnter: (ev) => onViewEvent.bind(this)('mouseenter', ev, view),
        onMouseMove: (ev) => onViewEvent.bind(this)('mousemove', ev, view),
        onMouseLeave: (ev) => onViewEvent.bind(this)('mouseleave', ev, view),
      })
    );

    Array.from(this.widgetMap.values()).forEach((widget) =>
      this.internalAddWidgetToView(widget, view)
    );
  }

  detachView(view) {
    const idx = this.views.indexOf(view);
    if (idx > -1) {
      this.views.splice(idx, 1);
      Array.from(this.widgetMap.values()).forEach((widget) =>
        this.internalRemoveWidgetFromView(widget, view)
      );
    }
  }
}
