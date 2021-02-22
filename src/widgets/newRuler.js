import vtkCustomDistanceWidget from '@/src/vtk/CustomDistanceWidget';
import { onWidgetStateChanged } from './context';
import { observe, ref } from './reactivity';
import { useSliceFollower } from './widgetHooks';

const START = 1;
const PARTIAL = 2;
const COMPLETE = 3;

export default {
  setup({ store, widgetInstances, viewTypeMap, unfocusSelf }) {
    const factory = vtkCustomDistanceWidget.newInstance();
    const widgetState = factory.getWidgetState();

    const placeState = ref(START);
    const lockAxis = ref(null);
    const lockSlice = ref(null);

    function reset() {
      lockAxis.value = null;
      lockSlice.value = null;
      // reset widget state
      widgetState.clearHandleList();
    }

    // follow the active view/slice.
    // when the provided axis/slice is not null,
    // then only show widget when a view is on that axis/slice
    const { axis: curAxis, slice: curSlice } = useSliceFollower(
      store,
      lockAxis,
      lockSlice,
      factory,
      viewTypeMap,
      widgetInstances
    );

    observe([curAxis, curSlice], ([axis, slice]) => {
      if (
        placeState.value === PARTIAL &&
        (slice !== lockSlice.value || axis !== lockAxis.value)
      ) {
        reset();
      }
    });

    observe(placeState, (state) => {
      if (state === COMPLETE) {
        unfocusSelf();
      }
    });

    onWidgetStateChanged(() => {
      const list = widgetState.getHandleList();

      if (list.length === 1) {
        // placed the first point.
        // If the slice changes or the mouse leaves the view,
        // reset the widget.
        placeState.value = PARTIAL;
        lockAxis.value = curAxis.value;
        lockSlice.value = curSlice.value;
      }

      if (list.length === 2) {
        placeState.value = COMPLETE;
      }

      /*
      setMeasurementData(id, {
        length: widgetFactory.getDistance(),
      });
      */
    });

    return {
      factory,
      serialize() {
        return {
          version: '1.0',
          type: 'Ruler',
          name: 'W',
          data: {
            coordinates: 'World',
            point1: [],
            point2: [],
          },
        };
      },
    };
  },
};
