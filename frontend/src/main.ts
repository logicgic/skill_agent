import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

/**
 * 前端应用根实例。
 *
 * @remarks
 * 负责挂载路由并启动 Vue 应用。
 */
const app = createApp(App)

app.use(router)

app.mount('#app')
