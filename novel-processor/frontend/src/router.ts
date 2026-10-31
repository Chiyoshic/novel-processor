import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'shelf',
      component: () => import('@/views/ShelfView.vue'),
      meta: { title: '书架' },
    },
    {
      path: '/novel/:site/:novelId',
      name: 'novel',
      component: () => import('@/views/NovelView.vue'),
      props: true,
      meta: { title: '作品' },
    },
    {
      path: '/novel/:site/:novelId/episodes/:index',
      name: 'reader',
      component: () => import('@/views/ReaderView.vue'),
      props: true,
      meta: { title: '阅读' },
    },
    {
      path: '/novel/:site/:novelId/translation',
      name: 'translation',
      component: () => import('@/views/TranslationView.vue'),
      props: true,
      meta: { title: 'AI 翻译' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/trash',
      name: 'trash',
      component: () => import('@/views/TrashView.vue'),
      meta: { title: '回收站' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.afterEach((to) => {
  const base = 'novel-processor'
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · ${base}` : base
})
