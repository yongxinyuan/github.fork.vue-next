import {
  Component,
  Data,
  validateComponentName,
  PublicAPIComponent
} from './component'
import { ComponentOptions } from './componentOptions'
import { ComponentPublicInstance } from './componentProxy'
import { Directive, validateDirectiveName } from './directives'
import { RootRenderFunction } from './renderer'
import { InjectionKey } from './apiInject'
import { isFunction, NO, isObject } from '@vue/shared'
import { warn } from './warning'
import { createVNode, cloneVNode, VNode } from './vnode'
import { RootHydrateFunction } from './hydration'

export interface App<HostElement = any> {
  config: AppConfig
  use(plugin: Plugin, ...options: any[]): this
  mixin(mixin: ComponentOptions): this
  component(name: string): PublicAPIComponent | undefined
  component(name: string, component: PublicAPIComponent): this
  directive(name: string): Directive | undefined
  directive(name: string, directive: Directive): this
  mount(
    rootContainer: HostElement | string,
    isHydrate?: boolean
  ): ComponentPublicInstance
  unmount(rootContainer: HostElement | string): void
  provide<T>(key: InjectionKey<T> | string, value: T): this

  // internal. We need to expose these for the server-renderer
  _component: Component
  _props: Data | null
  _container: HostElement | null
  _context: AppContext
}

export type OptionMergeFunction = (
  to: unknown,
  from: unknown,
  instance: any,
  key: string
) => any

export interface AppConfig {
  // @private
  readonly isNativeTag?: (tag: string) => boolean

  devtools: boolean
  performance: boolean
  optionMergeStrategies: Record<string, OptionMergeFunction>
  globalProperties: Record<string, any>
  isCustomElement: (tag: string) => boolean
  errorHandler?: (
    err: unknown,
    instance: ComponentPublicInstance | null,
    info: string
  ) => void
  warnHandler?: (
    msg: string,
    instance: ComponentPublicInstance | null,
    trace: string
  ) => void
}

export interface AppContext {
  config: AppConfig
  mixins: ComponentOptions[]
  components: Record<string, PublicAPIComponent>
  directives: Record<string, Directive>
  provides: Record<string | symbol, any>
  reload?: () => void // HMR only
}

type PluginInstallFunction = (app: App, ...options: any[]) => any

export type Plugin =
  | PluginInstallFunction & { install?: PluginInstallFunction }
  | {
    install: PluginInstallFunction
  }

/**
 * 创建app上下文，返回一个对象
 */
export function createAppContext(): AppContext {
  return {
    config: {
      isNativeTag: NO,
      devtools: true,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      isCustomElement: NO,
      errorHandler: undefined,
      warnHandler: undefined
    },
    mixins: [],
    components: {},
    directives: {},
    provides: Object.create(null)
  }
}

export type CreateAppFunction<HostElement> = (
  rootComponent: PublicAPIComponent,
  rootProps?: Data | null
) => App<HostElement>

/**
 * 创建createApp函数
 * 
 * @param render 环境渲染函数
 * @param hydrate 
 */
export function createAppAPI<HostElement>(
  render: RootRenderFunction,
  hydrate?: RootHydrateFunction
): CreateAppFunction<HostElement> {
  /**
   * createApp()函数对应renderer.createApp()函数
   */
  return function createApp(rootComponent, rootProps = null) {
    /**
     * rootProps必须是对象，否则重制为null
     */
    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && warn(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }

    /**
     * 创建app上下文对象
     */
    const context = createAppContext()
    /**
     * 创建一个Set保存安装的插件
     */
    const installedPlugins = new Set()

    /**
     * 标记未创建完成
     */
    let isMounted = false

    /**
     * 创建一个app对象
     */
    const app: App = {
      _component: rootComponent as Component,
      _props: rootProps,
      _container: null,
      _context: context,

      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            `app.config cannot be replaced. Modify individual options instead.`
          )
        }
      },

      use(plugin: Plugin, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
          __DEV__ && warn(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin)
          plugin(app, ...options)
        } else if (__DEV__) {
          warn(
            `A plugin must either be a function or an object with an "install" ` +
            `function.`
          )
        }
        return app
      },

      mixin(mixin: ComponentOptions) {
        if (__FEATURE_OPTIONS__) {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (__DEV__) {
            warn(
              'Mixin has already been applied to target app' +
              (mixin.name ? `: ${mixin.name}` : '')
            )
          }
        } else if (__DEV__) {
          warn('Mixins are only available in builds supporting Options API')
        }
        return app
      },

      component(name: string, component?: PublicAPIComponent): any {
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          return context.components[name]
        }
        if (__DEV__ && context.components[name]) {
          warn(`Component "${name}" has already been registered in target app.`)
        }
        context.components[name] = component
        return app
      },

      directive(name: string, directive?: Directive) {
        if (__DEV__) {
          validateDirectiveName(name)
        }

        if (!directive) {
          return context.directives[name] as any
        }
        if (__DEV__ && context.directives[name]) {
          warn(`Directive "${name}" has already been registered in target app.`)
        }
        context.directives[name] = directive
        return app
      },

      /**
       * 原始app.mount()函数
       * 
       * @param rootContainer 根容器
       * @param isHydrate 是否需要混合
       */
      mount(rootContainer: HostElement, isHydrate?: boolean): any {
        /**
         * 读取标记mounted未创建，执行创建
         */
        if (!isMounted) {
          /**
           * 1. 根据创建传入的参数，创建VNode
           */
          const vnode = createVNode(rootComponent as Component, rootProps)
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          /**
           * 2. 将app上下文存储到根VNode上，将在初始化安装时设置到根实例上
           */
          vnode.appContext = context

          /**
           * 开发环境热更新，暂不考虑
           */
          if (__BUNDLER__ && __DEV__) {
            context.reload = () => {
              render(cloneVNode(vnode), rootContainer)
            }
          }

          /**
           * 渲染VNode到根容器中
           */
          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            render(vnode, rootContainer)
          }

          /**
           * 标记已经安装成功
           */
          isMounted = true

          /**
           * 将容器元素绑定到app._container上
           */
          app._container = rootContainer

          /**
           * 返回proxy，这里的写法是什么意思？
           */
          return vnode.component!.proxy
        }
        /**
         * 如果标记已经创建完成，并且是开发环境，抛出警告
         */
        else if (__DEV__) {
          warn(
            `App has already been mounted. Create a new app instance instead.`
          )
        }
      },

      unmount() {
        if (isMounted) {
          render(null, app._container)
        } else if (__DEV__) {
          warn(`Cannot unmount an app that is not mounted.`)
        }
      },

      provide(key, value) {
        if (__DEV__ && key in context.provides) {
          warn(
            `App already provides property with key "${key}". ` +
            `It will be overwritten with the new value.`
          )
        }
        // TypeScript doesn't allow symbols as index type
        // https://github.com/Microsoft/TypeScript/issues/24587
        context.provides[key as string] = value

        return app
      }
    }

    /**
     * 返回创建的app对象
     */
    return app
  }
}
