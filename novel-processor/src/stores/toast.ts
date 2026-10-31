/**
 * 全局轻提示。
 *
 * 放在模块级单例里而不是每个视图各自维护：
 * 删除作品后要跳回书架，若 toast 属于视图，跳转瞬间就消失了。
 */
import { ref } from 'vue'

export type ToastTone = 'ok' | 'error'

export interface ToastState {
  message: string
  tone: ToastTone
}

const toast = ref<ToastState | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export function notify(message: string, tone: ToastTone = 'ok'): void {
  toast.value = { message, tone }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    toast.value = null
  }, 4200)
}

export function dismissToast(): void {
  toast.value = null
  if (timer) clearTimeout(timer)
}

export function useToast() {
  return { toast, notify, dismiss: dismissToast }
}
