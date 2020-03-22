import Vue from 'vue';
import { MdButton, MdIcon, MdToolbar } from 'vue-material/dist/components';

import 'normalize.css';
import 'vue-material/dist/vue-material.min.css';
import 'vue-material/dist/theme/default.css';

import App from './App.vue';

Vue.config.productionTip = false;
Vue.use(MdButton);
Vue.use(MdIcon);
Vue.use(MdToolbar);

new Vue({
  render: h => h(App),
}).$mount('#app');
