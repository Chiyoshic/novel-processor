import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import AppSelect from './components/AppSelect.vue'
import AppTabs from './components/AppTabs.vue'
import { router } from './router'

createApp(App).component('AppSelect', AppSelect).component('AppTabs', AppTabs).use(router).mount('#app')
