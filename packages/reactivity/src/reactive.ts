import { isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReadonlyHandlers,
  shallowReactiveHandlers
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
import { UnwrapRef, Ref, isRef } from './ref'
import { makeMap } from '@vue/shared'

// WeakMaps that store {raw <-> observed} pairs.
const rawToReactive = new WeakMap<any, any>()
const reactiveToRaw = new WeakMap<any, any>()
const rawToReadonly = new WeakMap<any, any>()
const readonlyToRaw = new WeakMap<any, any>()

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const isObservableType = /*#__PURE__*/ makeMap(
  'Object,Array,Map,Set,WeakMap,WeakSet'
)

/**
 * 同时满足以下5中情况才是可观察对象
 * 1. value._isVue = false
 * 2. value.isVNode = false
 * 3. 必须是定义的可观察类型
 * 4. nonReactiveValues中没有目标的
 * 5. 对象没有被冻结
 * 
 * @param value 观察对象
 */
const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    isObservableType(toRawType(value)) &&
    !nonReactiveValues.has(value) &&
    !Object.isFrozen(value)
  )
}

// only unwrap nested ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  if (isRef(target)) {
    return target
  }
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

// Return a reactive-copy of the original object, where only the root level
// properties are readonly, and does NOT unwrap refs nor recursively convert
// returned properties.
// This is used for creating the props proxy object for stateful components.
export function shallowReadonly<T extends object>(
  target: T
): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    shallowReadonlyHandlers,
    readonlyCollectionHandlers
  )
}

// Return a reactive-copy of the original object, where only the root level
// properties are reactive, and does NOT unwrap refs nor recursively convert
// returned properties.
export function shallowReactive<T extends object>(target: T): T {
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    shallowReactiveHandlers,
    mutableCollectionHandlers
  )
}

/**
 * 创建响应式对象
 * 
 * @param target 被监听的目标
 * @param toProxy target<->proxy 搜集器
 * @param toRaw proxy<->target 搜集器
 * @param baseHandlers 基础代理函数
 * @param collectionHandlers 搜集代理函数
 */
function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  /**
   * 1. 如果不是对象，返回目标本身
   */
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }

  /**
   * 2. 在target<->proxy中代理，判断是否是可观察对象
   */
  let observed = toProxy.get(target)

  /**
   * 3. 如果已经是可观察对象，返回可观察对象
   */
  if (observed !== void 0) {
    return observed
  }
  /**
   * 4. 如果proxy<->target中存在目标，说明已经是代理对象了
   *    返回代理对象本身
   */
  if (toRaw.has(target)) {
    return target
  }

  /**
   * 5. 如果目标不是可观察对象，返回目标本身
   */
  if (!canObserve(target)) {
    return target
  }

  /**
   * 6. 根据构造器类型判断，使用集合代理函数或者基础代理函数
   */
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers

  /**
   * 7. 创建代理
   */
  observed = new Proxy(target, handlers)

  /**
   * 8. 存储原始对象和代理正反关系
   */
  toProxy.set(target, observed)
  toRaw.set(observed, target)

  /**
   * 9. 返回代理对象
   */
  return observed
}

/**
 * 判断对象是否是响应式的
 * reactiveToRaw或readonlyToRaw中含有value作为key值，都算是
 * 
 * @param value 
 */
export function isReactive(value: unknown): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: unknown): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T extends object>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
