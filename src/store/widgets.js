import Vue from 'vue';

import { asMutation } from '@/src/utils/common';
import { NO_WIDGET } from '@/src/constants';

export default ({ widgetProvider }) => ({
  namespaced: true,

  state: {
    focusedWidget: NO_WIDGET,
  },

  mutations: {
    focusWidget(state, id) {
      state.focusedWidget = id;
    },
    unfocusActiveWidget(state) {
      state.focusedWidget = NO_WIDGET;
    },

    addAndActivateWidget(state, id) {
      state.widgetList.push(id);
      state.activeWidgetID = id;
    },
    removeWidget(state, widgetID) {
      const idx = state.widgetList.indexOf(widgetID);
      if (idx > -1) {
        state.widgetList.splice(idx, 1);
      }
      Vue.delete(state.removeWidgetOnDeactivate, widgetID);
    },
    deactivateActiveWidget(state) {
      state.activeWidgetID = NO_WIDGET;
    },
    setRemoveWidgetOnDeactivate(state, { widgetID, remove }) {
      Vue.set(state.removeWidgetOnDeactivate, widgetID, remove);
    },
  },

  actions: {
    focusWidget: asMutation('focusWidget'),
    unfocusActiveWidget: asMutation('unfocusActiveWidget'),

    // TODO Remove
    async removeWidget({ state, commit }, id) {
      if (state.activeWidgetID === id) {
        // don't call the unfocusActiveWidget action, as removeWidget
        // will handle
        commit('unfocusActiveWidget');
      }
      widgetProvider.removeWidget(id);
      // delete any associated measurement data
      // await dispatch('measurements/deleteMeasurement', id);
    },
  },
});
