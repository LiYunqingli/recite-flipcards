// 系统返回键（Android 硬件返回）拦截注册表。
// 用于在「应用内逐级返回」时，让嵌套弹窗（如二次确认框）优先于
// 顶层导航（学习页 / 牌库详情 / Tab 切换 / 退出）消费返回事件。
//
// 返回处理器约定：返回 true 表示已消费（拦截），返回 false 表示
// 不处理、交由上层逻辑继续判断。后注册者优先（模拟弹窗栈顶）。

type BackHandler = () => boolean

const handlers = new Set<BackHandler>()

/** 注册一个返回拦截器，返回取消函数。 */
export function registerBackHandler(handler: BackHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** 按注册逆序执行拦截器，任一返回 true 即停止。返回是否有拦截器消费。 */
export function runBackInterceptors(): boolean {
  const list = Array.from(handlers)
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]()) return true
  }
  return false
}
