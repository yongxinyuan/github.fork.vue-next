import {
  createRenderer,
  createHydrationRenderer,
  warn,
  RootRenderFunction,
  CreateAppFunction,
  Renderer,
  HydrationRenderer,
  App,
  RootHydrateFunction
} from '@vue/runtime-core'
import { nodeOps } from './nodeOps'
import { patchProp } from './patchProp'
// Importing from the compiler, will be tree-shaken in prod
import { isFunction, isString, isHTMLTag, isSVGTag } from '@vue/shared'

const rendererOptions = {
  patchProp,
  ...nodeOps
}

// lazy create the renderer - this makes core renderer logic tree-shakable
// in case the user only imports reactivity utilities from Vue.
let renderer: Renderer | HydrationRenderer

let enabledHydration = false

/**
 * 确保渲染器存在
 */
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions))
}

function ensureHydrationRenderer() {
  renderer = enabledHydration
    ? renderer
    : createHydrationRenderer(rendererOptions)
  enabledHydration = true
  return renderer as HydrationRenderer
}

// use explicit type casts here to avoid import() calls in rolled-up d.ts
export const render = ((...args) => {
  ensureRenderer().render(...args)
}) as RootRenderFunction<Element>

export const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args)
}) as RootHydrateFunction

/**
 * 创建应用程序，入口API
 */
export const createApp = ((...args) => {
  /**
   * 1. 根据参数创建app
   */
  const app = ensureRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  /**
   * 2. 获取app.mount()函数
   */
  const { mount } = app
  /**
   * 3. 重写app.mount()函数
   * 
   * @param { Element | string } 容器元素或者容器元素选择器字符串
   */
  app.mount = (containerOrSelector: Element | string): any => {
    /**
     * 标准化容器，获取对应的元素
     */
    const container = normalizeContainer(containerOrSelector)
    /**
     * 如果没有对应的容器，退出执行
     */
    if (!container) return
    /**
     * 从app._component属性获取根组件
     */
    const component = app._component
    /**
     * 如果根组件不是函数，没有render属性，也没有template属性
     * 设置根组件的模版为容器里的内容
     */
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
    }
    /**
     * 在开始安装之前，清空容器里的元素
     */
    container.innerHTML = ''
    /**
     * 执行原始的app.mount()函数，返回代理
     */
    const proxy = mount(container)
    /**
     * 移除容器上的v-cloak属性
     */
    container.removeAttribute('v-cloak')
    /**
     * 返回代理
     */
    return proxy
  }

  /**
   * 4. 返回app
   */
  return app
}) as CreateAppFunction<Element>

export const createSSRApp = ((...args) => {
  const app = ensureHydrationRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (container) {
      return mount(container, true)
    }
  }

  return app
}) as CreateAppFunction<Element>

function injectNativeTagCheck(app: App) {
  // Inject `isNativeTag`
  // this is used for component name validation (dev only)
  Object.defineProperty(app.config, 'isNativeTag', {
    value: (tag: string) => isHTMLTag(tag) || isSVGTag(tag),
    writable: false
  })
}

/**
 * 规范化容器
 * 
 * @param container 
 */
function normalizeContainer(container: Element | string): Element | null {
  /**
   * 如果容器是字符串，返回选择器对应的元素
   */
  if (isString(container)) {
    const res = document.querySelector(container)
    if (__DEV__ && !res) {
      warn(`Failed to mount app: mount target selector returned null.`)
    }
    return res
  }
  /**
   * 如果原本就是元素，直接返回
   */
  return container
}

// DOM-only runtime directive helpers
export {
  vModelText,
  vModelCheckbox,
  vModelRadio,
  vModelSelect,
  vModelDynamic
} from './directives/vModel'
export { withModifiers, withKeys } from './directives/vOn'
export { vShow } from './directives/vShow'

// DOM-only components
export { Transition, TransitionProps } from './components/Transition'
export {
  TransitionGroup,
  TransitionGroupProps
} from './components/TransitionGroup'

// re-export everything from core
// h, Component, reactivity API, nextTick, flags & types
export * from '@vue/runtime-core'
