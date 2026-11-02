import type AppSelect from './components/AppSelect.vue'
import type AppTabs from './components/AppTabs.vue'

// 全局组件的模板类型声明，与 main.ts 注册保持同步。
declare module 'vue' {
  export interface GlobalComponents {
    AppSelect: typeof AppSelect
    AppTabs: typeof AppTabs
  }
}
