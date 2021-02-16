import { ViewTypes } from 'vtk.js/Sources/Widgets/Core/WidgetManager/Constants';

import PaintWidget from '@/src/widgets/paint';
import RulerWidget from '@/src/widgets/ruler';
import CrosshairsWidget from '@/src/widgets/slicingCrosshairs';
import { createContext, openContext, closeCurrentContext } from './context';

export const DEFAULT_NAME_LOOKUP = {
  Paint: PaintWidget,
  Ruler: RulerWidget,
  Crosshairs: CrosshairsWidget,
};

function generateHookArgs(widget, view = null, viewType = null) {
  const args = {
    id: widget.id,
    widgetState: widget.factory.getWidgetState(),
    widgetFactory: widget.factory,
    widgetInstances: widget.instances,
  };

  if (view) {
    args.view = view;
    if (widget.instances.has(view)) {
      args.viewWidget = widget.instances.get(view);
    }
  }
  if (viewType) {
    args.viewType = viewType;
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

  return {
    unsubscribe() {
      modSub.unsubscribe();
      setContainer(null);
    },
  };
}

function onViewEvent(type, event, view) {
  const viewType = this.viewTypes.get(view);
  Array.from(this.widgetMap.values()).forEach((widget) => {
    if (widget.instances.has(view)) {
      widget.context.invokeHook('viewMouseEvent', {
        ...generateHookArgs(widget, view, viewType),
        type,
        event,
      });
    }
  });
}

function addWidgetToView(widget, view) {
  withWidgetManager(view, (wm) => {
    const viewType = this.viewTypes.get(view);

    const flags = widget.context.invokeHook(
      'beforeAddToView',
      generateHookArgs(widget, view, viewType)
    );

    if (flags.some((fl) => fl === false)) {
      return;
    }

    const viewWidget = wm.addWidget(widget.factory, viewType);
    widget.instances.set(view, viewWidget);

    widget.context.invokeHook(
      'addedToView',
      generateHookArgs(widget, view, viewType)
    );
  });
}

function removeWidgetFromView(widget, view) {
  withWidgetManager(view, (wm) => {
    const viewType = this.viewTypes.get(view);

    widget.context.invokeHook(
      'beforeRemoveToView',
      generateHookArgs(widget, view, viewType)
    );

    wm.removeWidget(widget.factory);
    widget.instances.delete(view);

    widget.context.invokeHook(
      'removedToView',
      generateHookArgs(widget, view, viewType)
    );
  });
}

export default class WidgetProvider {
  constructor(store, nameLookup = DEFAULT_NAME_LOOKUP) {
    this.store = store;
    this.nameLookup = nameLookup;
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

  createWidget(name, options) {
    if (name in this.nameLookup) {
      const id = this.nextID;
      const WidgetConstructor = this.nameLookup[name];

      const context = createContext();
      openContext(context);
      const { factory, serialize } = WidgetConstructor.setup({
        store: this.store,
        initialState: options?.initialState,
        // setTimeout will allow these functions to trigger
        // post-creation.
        deleteSelf: () => setTimeout(() => this.deleteWidget(id)),
        unfocusSelf: () => setTimeout(() => this.focusWidget(id)),
        focusSelf: () => setTimeout(() => this.unfocusWidget(id)),
      });
      closeCurrentContext();

      const widget = {
        type: name,
        id,
        factory,
        context,
        instances: new Map(), // view -> viewWidget
        serialize,
        subscriptions: [],
      };
      this.widgetMap.set(id, widget);

      const widgetState = factory.getWidgetState();

      widget.subscriptions.push(
        widgetState.onModified(() => {
          widget.context.invokeHook('widgetStateChanged', {
            widgetState,
            widgetFactory: factory,
          });
        })
      );

      this.addWidgetToViews(id);

      this.nextID += 1;
      return widget;
    }
    throw new Error(`Could not find widget ${name}`);
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
          const viewType = this.viewTypes.get(view);
          const viewWidget = widget.instances.get(view);

          const flags = widget.context.invokeHook(
            'beforeFocus',
            generateHookArgs(widget, view, viewType)
          );

          if (flags.some((fl) => fl === false)) {
            return;
          }

          wm.grabFocus(viewWidget);

          widget.context.invokeHook(
            'focused',
            generateHookArgs(widget, view, viewType)
          );
        })
      );

      this.store.dispatch('focusWidget', id);
    }
  }

  unfocus() {
    this.views.forEach((view) =>
      withWidgetManager(view, (wm) => {
        wm.releaseFocus();
        const viewType = this.viewTypes.get(view);

        const it = this.widgetMap.values();
        let { value: widget, done } = it.next();
        while (!done) {
          if (widget.instances.has(view)) {
            widget.context.invokeHook(
              'unFocused',
              generateHookArgs(widget, view, viewType)
            );
          }
          ({ value: widget, done } = it.next());
        }
      })
    );

    this.store.dispatch('unfocusActiveWidget');
  }

  deleteWidget(id) {
    const widget = this.widgetMap.get(id);
    if (widget) {
      this.removeWidgetFromViews(id);
      widget.context.invokeHook('beforeDelete');
      while (widget.subscriptions.length) {
        widget.subscriptions.pop().unsubscribe();
      }
      widget.context = null;
      widget.factory = null;
      widget.instances = null;
      this.widgetMap.delete(id);
      widget.context.invokeHook('deleted');
    }
  }

  addView(view, viewType = ViewTypes.DEFAULT) {
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
