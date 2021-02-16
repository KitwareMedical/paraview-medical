import vtkCustomDistanceWidget from '@/src/vtk/CustomDistanceWidget';
import { onWidgetStateChanged } from './context';
import { ref } from './reactivity';

export default {
  setup({ id, store, initialState, unfocusSelf }) {
    const factory = vtkCustomDistanceWidget.newInstance();

    const lockAxis = ref(null);
    const lockSlice = ref(null);

    // follow the active view/slice.
    // when the provided axis/slice is not null,
    // then only show widget when a view is on that axis/slice
    const { axis: curAxis, slice: curSlice } = useSliceFollower(
      store,
      lockAxis,
      lockSlice
    );

    onWidgetStateChanged(({ widgetFactory }) => {
      const list = this.state.getHandleList();

      if (list.length === 2) {
        unfocusSelf();
      }

      setMeasurementData(id, {
        length: widgetFactory.getDistance(),
      });
    });

    return {
      factory,
      serialize() {
        return {
          version: '1.0',
          data: {
            point1: [],
            point2: [],
          },
        };
      },
    };
  },
};
