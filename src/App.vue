<template>
  <drag-and-drop enabled @drop="openFiles">
    <template v-slot="{ dragHover }">
      <v-app>
        <resizable-nav-drawer
          id="left-nav"
          app
          permanent
          :min-width="250"
          :max-width="450"
          :width="350"
          :handle-size="4"
        >
          <div id="left-pane-outer">
            <div id="left-pane">
              <div id="module-switcher" class="mt-1 mb-2">
                <v-select
                  v-model="selectedModule"
                  outlined
                  single-line
                  hide-details
                  :prepend-inner-icon="`mdi-${selectedModule.icon}`"
                  :items="Modules"
                  item-text="name"
                  return-object
                  class="no-select"
                >
                  <template v-slot:item="{ item }">
                    <v-icon v-if="item.icon" class="mr-1">
                      mdi-{{ item.icon }}
                    </v-icon>
                    {{ item.name }}
                  </template>
                </v-select>
              </div>

              <!-- Preserve component state of modules when switching between modules -->
              <div id="module-container">
                <template v-for="mod in Modules">
                  <component
                    :key="mod.name"
                    v-show="selectedModule === mod"
                    :is="mod.component"
                  />
                </template>
              </div>
            </div>
          </div>
        </resizable-nav-drawer>

        <v-main id="content-wrapper">
          <div class="height-100 d-flex flex-row flex-grow-1 grey darken-3">
            <div
              id="tools-strip"
              class="grey darken-4 d-flex flex-column align-center"
            >
              <tool-button
                size="40"
                icon="mdi-folder-open"
                name="Open files"
                @click="userPromptFiles"
              />
              <v-menu offset-x>
                <template v-slot:activator="{ on, attrs }">
                  <!-- hack to get menu to show up -->
                  &nbsp;
                  <tool-button
                    size="40"
                    icon="mdi-view-dashboard"
                    name="Layouts"
                    v-bind="attrs"
                    v-on="on"
                  />
                </template>
                <v-card>
                  <v-card-text>
                    <v-radio-group
                      v-model="layoutName"
                      class="mt-0"
                      hide-details
                    >
                      <v-radio label="Axial Primary" value="AxialPrimary" />
                      <v-radio label="Quad View" value="QuadView" />
                    </v-radio-group>
                  </v-card-text>
                </v-card>
              </v-menu>
              <div class="mt-2 mb-1 tool-separator" />
              <item-group v-if="hasData" v-model="selectedTool">
                <template v-for="(tool, i) in Tools">
                  <groupable-item
                    v-slot:default="{ active, toggle }"
                    :key="i"
                    :value="tool.name"
                  >
                    <tool-button
                      size="40"
                      :icon="`mdi-${tool.icon}`"
                      :name="tool.name"
                      :buttonClass="[
                        'tool-btn',
                        active ? 'tool-btn-selected' : '',
                      ]"
                      :disabled="!hasBaseImage"
                      @click="toggle"
                    />
                  </groupable-item>
                </template>
              </item-group>
            </div>
            <div class="d-flex flex-column flex-grow-1">
              <template v-if="hasData">
                <layout-grid :layout="layout" />
              </template>
              <template v-else>
                <v-row
                  no-gutters
                  align="center"
                  class="clickable"
                  @click="userPromptFiles"
                >
                  <v-col>
                    <v-row justify="center">
                      <v-card
                        flat
                        dark
                        color="transparent"
                        class="text-center headline"
                      >
                        <div>
                          <v-icon size="64">mdi-folder-open</v-icon>
                        </div>
                        <div>Click anywhere here to open files</div>
                        <div class="mt-8">
                          <v-icon size="64">mdi-arrow-down-bold</v-icon>
                        </div>
                        <div>Drop your files anywhere here to open</div>
                      </v-card>
                    </v-row>
                  </v-col>
                </v-row>
              </template>
            </div>
          </div>
        </v-main>

        <v-dialog v-model="errors.dialog" width="50%">
          <v-card>
            <v-card-title>Application Errors</v-card-title>
            <v-card-text>
              <v-container>
                <v-row
                  v-for="(errorInfo, i) in allErrors"
                  :key="i"
                  no-gutters
                  class="align-center mt-2"
                >
                  <v-col
                    cols="6"
                    class="text-ellipsis subtitle-1 black--text"
                    :title="errorInfo.name"
                  >
                    Error: {{ errorInfo.name }}
                  </v-col>
                  <v-col>
                    <span class="ml-2">
                      {{ errorInfo.error.message || 'Unknown error' }}
                    </span>
                  </v-col>
                </v-row>
              </v-container>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" @click="clearAndCloseErrors">
                Clear
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <notifications position="bottom left" :duration="4000" width="350px">
          <template slot="body" slot-scope="{ item, close }">
            <div
              class="vue-notification-template general-notifications"
              :class="`notify-${item.type}`"
              @click="close"
            >
              <div class="notification-content d-flex flex-row align-center">
                <span class="subtitle-1 flex-grow-1">{{ item.text }}</span>
                <div class="actions-stack d-flex flex-column align-right">
                  <template v-if="item.data && item.data.actions">
                    <v-btn
                      v-for="(action, i) in item.data.actions"
                      :key="i"
                      text
                      color="white"
                      @click.stop="
                        close();
                        action.onclick();
                      "
                    >
                      {{ action.text }}
                    </v-btn>
                  </template>
                  <template v-else>
                    <v-btn
                      v-if="item.type !== 'loading'"
                      text
                      color="white"
                      @click.stop="close"
                    >
                      Close
                    </v-btn>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </notifications>
        <v-overlay
          :value="dragHover"
          color="#fff"
          z-index="100"
          class="text-center"
        >
          <v-icon color="black" size="4.75rem">mdi-download</v-icon>
          <div class="text-h2 font-weight-bold black--text">
            Drop your files to open
          </div>
        </v-overlay>
      </v-app>
    </template>
  </drag-and-drop>
</template>

<script>
import { mapActions, mapState } from 'vuex';

import { createFourUpViews } from '@/src/vtk/proxyUtils';
import { NO_WIDGET, NO_SELECTION } from '@/src/constants';

import ResizableNavDrawer from './components/ResizableNavDrawer.vue';
import ToolButton from './components/ToolButton.vue';
import ItemGroup from './components/ItemGroup.vue';
import GroupableItem from './components/GroupableItem.vue';
import VtkTwoView from './components/VtkTwoView.vue';
import VtkThreeView from './components/VtkThreeView.vue';
import LayoutGrid from './components/LayoutGrid.vue';
import PatientBrowser from './components/PatientBrowser.vue';
import Annotations from './components/Annotations.vue';
import VolumeRendering from './components/VolumeRendering.vue';
import MeasurementsModule from './components/MeasurementsModule.vue';
import ModelBrowser from './components/ModelBrowser.vue';
import DragAndDrop from './components/DragAndDrop.vue';

export const Modules = [
  {
    name: 'Patients & Images',
    icon: 'account',
    component: PatientBrowser,
  },
  {
    name: 'Annotations',
    icon: 'pencil',
    component: Annotations,
  },
  {
    name: 'Models',
    icon: 'hexagon-multiple',
    component: ModelBrowser,
  },
  {
    name: 'Volume Rendering',
    icon: 'cube',
    component: VolumeRendering,
  },
  {
    name: 'Measurements',
    icon: 'pencil-ruler',
    component: MeasurementsModule,
  },
];

export const Tools = [
  {
    name: 'Paint',
    icon: 'brush',
    key: 'Paint',
    focusModule: Annotations,
  },
  {
    name: 'Ruler',
    icon: 'ruler',
    key: 'Ruler',
  },
  {
    name: 'Crosshairs',
    icon: 'crosshairs',
    key: 'Crosshairs',
  },
];

export const Views = {
  Z: {
    comp: VtkTwoView,
    props: {
      key: 'ViewZ',
      viewType: 'ViewZ',
      viewName: 'Z:1',
      axis: 2,
      orientation: -1,
      viewUp: [0, -1, 0],
    },
  },
  X: {
    comp: VtkTwoView,
    props: {
      key: 'ViewX',
      viewType: 'ViewX',
      viewName: 'X:1',
      axis: 0,
      orientation: 1,
      viewUp: [0, 0, 1],
    },
  },
  Y: {
    comp: VtkTwoView,
    props: {
      key: 'ViewY',
      viewType: 'ViewY',
      viewName: 'Y:1',
      axis: 1,
      orientation: -1,
      viewUp: [0, 0, 1],
    },
  },
  Three: {
    comp: VtkThreeView,
    props: {
      key: 'View3D',
      viewType: 'View3D',
      viewName: '3D:1',
      axis: 2,
      orientation: -1,
      viewUp: [0, -1, 0],
    },
  },
};

export const Layouts = {
  AxialPrimary: ['V', Views.Z, ['H', Views.X, Views.Y, Views.Three]],
  QuadView: ['H', ['V', Views.X, Views.Three], ['V', Views.Y, Views.Z]],
};

export default {
  name: 'App',

  components: {
    ResizableNavDrawer,
    ToolButton,
    LayoutGrid,
    ItemGroup,
    GroupableItem,
    DragAndDrop,
  },

  inject: ['widgetProvider'],

  data: () => ({
    selectedTool: null,
    selectedModule: Modules[0],

    errors: {
      dialog: false,
      fileLoading: [],
      actionErrors: [],
    },
    layoutName: 'QuadView',
    Tools,
    Modules,
  }),

  computed: {
    ...mapState({
      datasets: 'data',
      selectedBaseImage: 'selectedBaseImage',
      baseImages: ({ data }) => [].concat(data.imageIDs, data.dicomIDs),
      annotationDatasets: ({ data: d }) => [].concat(d.labelmapIDs, d.modelIDs),
    }),
    ...mapState('widgets', ['activeWidgetID']),
    hasData() {
      return Object.keys(this.datasets.index).length > 0;
    },
    hasBaseImage() {
      return this.selectedBaseImage !== NO_SELECTION;
    },
    allErrors() {
      return [].concat(this.errors.fileLoading, this.errors.actionErrors);
    },
    layout() {
      return Layouts[this.layoutName] || [];
    },
  },

  watch: {
    fileErrorDialog(state) {
      if (!state) {
        this.fileLoadErrors = [];
      }
    },
    activeWidgetID(id) {
      if (id === NO_WIDGET) {
        this.selectedTool = null;
      }
    },
    selectedTool(tool) {
      if (tool) {
        const { key, focusModule } = Tools.find((v) => v.name === tool);
        const widget = this.widgetProvider.createWidget(key);
        this.widgetProvider.focusWidget(widget.id);

        if (focusModule) {
          const mod = Modules.find((m) => m.component === focusModule);
          if (mod) {
            this.selectedModule = mod;
          }
        }
      } else {
        this.widgetProvider.unfocus();
      }
    },
  },

  proxyManagerHooks: {
    onProxyModified() {
      // auto-sync views
      this.$proxyManager.autoAnimateViews();
    },
  },

  mounted() {
    const fileEl = document.createElement('input');
    fileEl.setAttribute('type', 'file');
    fileEl.setAttribute('multiple', 'multiple');
    fileEl.setAttribute('accept', '*');
    fileEl.addEventListener('change', this.onFileSelect);
    this.fileEl = fileEl;

    createFourUpViews(this.$proxyManager);
  },

  methods: {
    userPromptFiles() {
      this.fileEl.value = null;
      this.fileEl.click();
    },

    async onFileSelect(evt) {
      return this.openFiles(evt.target.files);
    },

    async openFiles(files) {
      this.$notify({
        id: 'loading',
        type: 'loading',
        duration: -1,
        text: 'Loading...',
      });

      const actions = [
        {
          text: 'details',
          onclick: () => {
            this.errors.dialog = true;
          },
        },
        {
          text: 'close',
          onclick: this.clearAndCloseErrors,
        },
      ];

      const beforeState = {
        hasBaseImages: !!this.baseImages.length,
        hasAnnotations: !!this.annotationDatasets.length,
      };

      try {
        const errors = await this.loadFiles(Array.from(files));
        if (errors.length) {
          this.errors.fileLoading = errors;
          this.$notify({
            type: 'error',
            duration: -1,
            text: 'Some files failed to load',
            data: { actions },
          });
        } else {
          this.$notify({ type: 'success', text: 'Files loaded' });
        }
      } catch (error) {
        this.errors.actionErrors.push({
          name: 'Unknown error',
          error,
        });
        this.$notify({
          type: 'error',
          duration: -1,
          text: 'An unknown file loading error occurred',
          data: { actions },
        });
      } finally {
        // TODO only close if there are no pending files
        this.$notify.close('loading');
      }

      const afterState = {
        hasBaseImages: !!this.baseImages.length,
        hasAnnotations: !!this.annotationDatasets.length,
      };

      // TODO only execute these blocks if we loaded non-zero datasets
      if (!beforeState.hasBaseImages && afterState.hasBaseImages) {
        const id = this.baseImages[0];
        await this.selectBaseImage(id);
        await this.updateScene({ reset: true });
      } else {
        const reset = !beforeState.hasBaseImages && !beforeState.hasAnnotations;
        await this.updateScene({ reset });
      }
    },

    clearAndCloseErrors() {
      this.errors.dialog = false;
      this.errors.fileLoading = [];
      this.errors.actionErrors = [];
    },

    relayoutAxial() {
      this.layout = Layouts.AxialPrimary;
    },

    relayoutQuad() {
      this.layout = Layouts.QuadView;
    },

    ...mapActions(['loadFiles', 'selectBaseImage']),
    ...mapActions('visualization', ['updateScene']),
  },
};
</script>

<style>
#content-wrapper {
  /* disable v-content transition when we resize our app drawer */
  transition: initial;
}

#content-wrapper > .v-content__wrap {
  display: flex;
}

#module-switcher .v-input__prepend-inner {
  /* better icon alignment */
  margin-top: 15px;
}

.alert > .v-snack__wrapper {
  /* transition background color */
  transition: background-color 0.25s;
}

.general-notifications {
  padding: 10px;
  margin: 0 20px 20px;
  color: #fff;
  background: #44a4fc;
  border-left: 5px solid #187fe7;
  user-select: none;
}

.general-notifications.notify-success {
  background: #4caf50;
  border-left-color: #42a85f;
}

.general-notifications.notify-warn {
  background: #ffb648;
  border-left-color: #f48a06;
}

.general-notifications.notify-error {
  background: #e54d42;
  border-left-color: #b82e24;
}

.tool-btn-selected {
  background-color: rgba(128, 128, 255, 0.7);
}
</style>

<style scoped>
#left-nav {
  padding: 2px;
  /* left-nav handle size is 4px */
  padding-right: 4px;
}

#tools-strip {
  border-left: 1px solid #212121;
  flex: 0 0 40px;
}

.view-box {
  box-sizing: border-box;
}

.clickable {
  cursor: pointer;
}

.tool-separator {
  width: 75%;
  height: 1px;
  border: none;
  border-top: 1px solid rgb(112, 112, 112);
}

#left-pane {
  display: flex;
  flex-flow: column;
  min-width: 225px;
  flex: 1;
}

#left-pane-outer {
  display: flex;
  overflow: auto;
  height: 100%;
  width: 100%;
}

#module-switcher {
  flex: 0 2;
}

#module-container {
  position: relative;
  flex: 2;
  overflow: auto;
}
</style>
