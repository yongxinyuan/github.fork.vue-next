import { RendererOptions } from '@vue/runtime-core'

/**
 * document对象
 */
const doc = (typeof document !== 'undefined' ? document : null) as Document

/**
 * svg命名空间
 */
const svgNS = 'http://www.w3.org/2000/svg'

let tempContainer: HTMLElement
let tempSVGContainer: SVGElement

export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  /**
   * 将child元素插入parent中ancho前面
   */
  insert: (child, parent, anchor) => {
    if (anchor) {
      parent.insertBefore(child, anchor)
    } else {
      parent.appendChild(child)
    }
  },

  /**
   * 删除元素
   */
  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  /**
   * 创建元素，is判断是否是自定义元素
   */
  createElement: (tag, isSVG, is): Element =>
    isSVG
      ? doc.createElementNS(svgNS, tag)
      : doc.createElement(tag, is ? { is } : undefined),

  /**
   * 创建文本节点
   */
  createText: text => doc.createTextNode(text),

  /**
   * 创建注释节点
   */
  createComment: text => doc.createComment(text),

  /**
   * 设置文本
   */
  setText: (node, text) => {
    node.nodeValue = text
  },

  /**
   * 设置元素文本
   */
  setElementText: (el, text) => {
    el.textContent = text
  },

  /**
   * 获取父元素
   */
  parentNode: node => node.parentNode as Element | null,

  /**
   * 获取下一个兄弟节点
   */
  nextSibling: node => node.nextSibling,

  /**
   * document.querySelector
   */
  querySelector: selector => doc.querySelector(selector),

  /**
   * 设置作用域id，其实是将id作为一个属性绑定到元素上
   * 
   * @param el 
   * @param id 
   */
  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  /**
   * 克隆el元素
   * 
   * @param el 
   */
  cloneNode(el) {
    return el.cloneNode(true)
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  /**
   * 插入静态内容，其实是创建一个临时容器，再转移到parent中
   * 
   * @param content 
   * @param parent 
   * @param anchor 
   * @param isSVG 
   */
  insertStaticContent(content, parent, anchor, isSVG) {
    /**
     * 获取临时节点
     * 1. 如果是svg，创建svg元素
     * 2. 如果不是，创建div元素
     */
    const temp = isSVG
      ? tempSVGContainer || (tempSVGContainer = doc.createElementNS(svgNS, 'svg'))
      : tempContainer || (tempContainer = doc.createElement('div'))

    /**
     * 将content置入temp元素中
     */
    temp.innerHTML = content

    /**
     * 节点是temp第一个子节点
     */
    const node = temp.children[0]

    /**
     * 将node插入到parent中
     */
    nodeOps.insert(node, parent, anchor)

    /**
     * 返回node
     */
    return node
  }
}