import { createRouter, createWebHistory } from 'vue-router'

/**
 * 前端路由实例。
 *
 * @remarks
 * 当前仅保留基础骨架，后续可按页面模块扩展 routes。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [],
})

export default router
