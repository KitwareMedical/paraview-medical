<template>
  <div class="vtk-container-wrapper">
    <div class="vtk-gutter">
      <slice-slider
        class="slice-slider"
        :slice="slice"
        :min="sliceRange[0]"
        :max="sliceRange[1]"
        :step="1"
        :handle-height="20"
        @input="setSlice"
      />
    </div>
    <div class="vtk-container" :class="active ? 'active' : ''">
      <div class="vtk-sub-container">
        <div class="vtk-view" ref="vtkContainer" />
      </div>
    </div>
  </div>
</template>

<script>
import {
  ref,
  toRefs,
  watch,
  unref,
  computed,
  reactive,
  watchEffect,
} from '@vue/composition-api';

import {
  CommonViewProps,
  useVtkView,
  useVtkViewCameraOrientation,
  giveViewAnnotations,
} from '@/src/composables/view/common';
import {
  useOrientationLabels,
  use2DMouseControls,
  usePixelProbe,
} from '@/src/composables/view/view2D';
import { useResizeObserver } from '@/src/composables/resizeObserver';
import { watchScene, watchColorBy } from '@/src/composables/scene';
import { useStore, useComputedState } from '@/src/composables/store';
import { useSubscription } from '@/src/composables/vtk';
import { useWidgetProvider } from '@/src/composables/widgetProvider';
import { useProxyManager } from '@/src/composables/proxyManager';

import { resize2DCameraToFit } from '@/src/vtk/proxyUtils';
import { DataTypes } from '@/src/constants';

import SliceSlider from '@/src/components/SliceSlider.vue';

/**
 * This differs from view.resetCamera() in that we reset the view
 * to the specified bounds.
 */
function resetCamera(viewRef, boundsWithSpacing, resizeToFit) {
  const view = unref(viewRef);
  if (view) {
    const renderer = view.getRenderer();
    renderer.computeVisiblePropBounds();
    renderer.resetCamera(unref(boundsWithSpacing));

    if (unref(resizeToFit)) {
      resize2DCameraToFit(view, unref(boundsWithSpacing));
    }
  }
}

export default {
  name: 'VtkTwoView',

  props: CommonViewProps,

  components: {
    SliceSlider,
  },

  setup(props) {
    const { viewName, viewType, viewUp, axis, orientation } = toRefs(props);
    const vtkContainer = ref(null);
    const resizeToFit = ref(true);
    const axisLabel = computed(() => 'xyz'[axis.value]);

    const store = useStore();
    const widgetProvider = useWidgetProvider();
    const pxm = useProxyManager();

    const {
      sceneSources,
      worldOrientation,
      colorBy,
      boundsWithSpacing,
      baseImage,
      currentSlice,
      windowing,
      dicomInfo,
    } = useComputedState({
      sceneSources(state, getters) {
        const { pipelines } = state.visualization;
        return getters.sceneObjectIDs
          .filter((id) => id in pipelines)
          .map((id) => pipelines[id].last);
      },
      worldOrientation: (state) => state.visualization.worldOrientation,
      colorBy: (state, getters) =>
        getters.sceneObjectIDs.map((id) => state.visualization.colorBy[id]),
      boundsWithSpacing: (_, getters) =>
        getters['visualization/boundsWithSpacing'],
      baseImage(state) {
        const { pipelines } = state.visualization;
        const { selectedBaseImage } = state;
        if (selectedBaseImage in pipelines) {
          return pipelines[selectedBaseImage].last;
        }
        return null;
      },
      currentSlice: (state) => state.visualization.slices[axisLabel.value],
      windowing: (state) => state.visualization.windowing,
      dicomInfo(state) {
        const { selectedBaseImage } = state;
        if (selectedBaseImage in state.data.index) {
          const dataInfo = state.data.index[selectedBaseImage];
          if (dataInfo.type === DataTypes.Dicom) {
            const { patientKey, studyKey, seriesKey } = dataInfo;
            return {
              patient: state.dicom.patientIndex[patientKey],
              study: state.dicom.studyIndex[studyKey],
              series: state.dicom.seriesIndex[seriesKey],
            };
          }
        }
        return null;
      },
    });

    const currentSliceSpacing = computed(
      () => worldOrientation.value.spacing[axis.value]
    );

    const viewRef = useVtkView({
      containerRef: vtkContainer,
      viewName,
      viewType,
    });

    // configure camera orientation
    useVtkViewCameraOrientation(viewRef, viewUp, axis, orientation);

    useResizeObserver(vtkContainer, () => {
      const view = unref(viewRef);
      if (view) {
        view.resize();
      }
    });

    watchScene(sceneSources, worldOrientation, viewRef);
    watchColorBy(colorBy, sceneSources, viewRef);

    // reset camera conditions
    watch(
      [baseImage, boundsWithSpacing],
      () => resetCamera(viewRef, boundsWithSpacing, resizeToFit),
      { immediate: true }
    );
    useSubscription(viewRef, (view) =>
      view.onResize(() => resetCamera(viewRef, boundsWithSpacing, resizeToFit))
    );

    // setup view
    watchEffect(() => {
      const view = unref(viewRef);
      if (view) {
        view.setOrientationAxesVisibility(false);
      }
    });

    // add/remove view from widget provider
    watch(viewRef, (view, oldView) => {
      widgetProvider.detachView(oldView);
      widgetProvider.addView(view, viewType.value);
    });

    // setup ranges for mouse controls
    const wwRange = computed(() => ({
      min: 0,
      max: windowing.value.max - windowing.value.min,
      step: 1 / 512,
      default: windowing.value.width,
    }));
    const wlRange = computed(() => ({
      min: windowing.value.min,
      max: windowing.value.max,
      step: 1 / 512,
      default: windowing.value.level,
    }));
    const sliceRange = computed(() => {
      const { bounds } = unref(worldOrientation);
      return {
        min: bounds[axis.value * 2],
        max: bounds[axis.value * 2 + 1],
        step: 1,
        default: currentSlice.value,
      };
    });

    const mouseValues = use2DMouseControls(
      viewRef,
      wwRange,
      wlRange,
      sliceRange,
      [
        { type: 'pan', options: { shift: true } },
        { type: 'zoom', options: { control: true } },
        { type: 'zoom', options: { button: 3 } },
      ]
    );

    // bind mouse outputs to ww, wl, and slice
    const setWindowWidth = (width) =>
      store.dispatch('visualization/setWindowing', { width });
    const setWindowLevel = (level) =>
      store.dispatch('visualization/setWindowing', { level });
    const setSlice = (s) =>
      store.dispatch('visualization/setSlices', { [axisLabel.value]: s });

    watch(mouseValues.vertVal, (ww) => setWindowWidth(ww));
    watch(mouseValues.horizVal, (wl) => setWindowLevel(wl));
    watch(mouseValues.scrollVal, (s) => setSlice(s));

    // sync windowing and slicing to reps
    watchEffect(() => {
      if (viewRef.value && baseImage.value) {
        const rep = pxm.getRepresentation(baseImage.value, viewRef.value);
        if (rep) {
          if (rep.setSlice)
            rep.setSlice(currentSlice.value * currentSliceSpacing.value);
          if (rep.setWindowWidth) rep.setWindowWidth(windowing.value.width);
          if (rep.setWindowLevel) rep.setWindowLevel(windowing.value.level);
        }
      }
    });

    // obtain pixel of base image under mouse cursor
    const { pixelProbe } = usePixelProbe(viewRef, baseImage);

    // orientation labels
    const { leftLabel, upLabel } = useOrientationLabels(
      viewRef,
      worldOrientation
    );

    // pixel probe annotation
    const pixelAnnotation = computed(() => {
      if (pixelProbe.value) {
        const { location, value } = pixelProbe.value;
        const coord = location.map((c) => Math.round(c));
        const pixel = value.map((p) => p.toFixed(1));
        return `(${coord.join(', ')}) = ${pixel.join(', ')}`;
      }
      return 'NONE';
    });

    // w/l annotation
    const windowAnnotations = computed(() => ({
      width: windowing.value.width.toFixed(1),
      level: windowing.value.level.toFixed(1),
    }));

    // dicom annotations
    const patientAnnotation = computed(() =>
      dicomInfo.value
        ? [
            dicomInfo.value.patient.patientName,
            `ID: ${dicomInfo.value.patient.PatientID}`,
          ].join('<br>')
        : ''
    );
    const studyAnnotation = computed(() =>
      dicomInfo.value
        ? [
            `StudyID: ${dicomInfo.value.study.StudyID}`,
            dicomInfo.value.study.StudyDescription,
            `Series #: ${dicomInfo.value.series.SeriesNumber}`,
            dicomInfo.value.series.SeriesDescription,
          ].join('<br>')
        : ''
    );

    giveViewAnnotations(
      viewRef,
      reactive({
        n: upLabel,
        w: leftLabel,
        nw: patientAnnotation,
        ne: studyAnnotation,
        sw: computed(() =>
          [
            `Slice: ${currentSlice.value + 1}`,
            `W/L: ${windowAnnotations.value.width}, ${windowAnnotations.value.level}`,
            `Pixel: ${pixelAnnotation.value}`,
          ].join('<br>')
        ),
      })
    );

    return {
      vtkContainer, // dom ref
      active: true,
      slice: currentSlice,
      sliceRange: computed(() => [sliceRange.value.min, sliceRange.value.max]),

      // methods
      setSlice,
    };
  },
};
</script>

<style src="@/src/assets/styles/vtk-view.css"></style>

<style scoped>
.vtk-gutter {
  display: flex;
  flex-flow: column;
}

.slice-slider {
  position: relative;
  flex: 1 1;
  width: 20px;
}
</style>
