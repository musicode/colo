
import Mustache from './compiler/parser/Mustache'

import {
  Emitter,
} from './util/event'

import {
  each as objectEach,
  set as objectSet,
  get as objectGet,
} from './util/object'

import {
  find,
} from './util/dom'

import {
  isString,
  isObject,
} from './util/is'

import {
  create,
  init,
  update,
} from './dom/snabbdom'

export default class Cola extends Emitter {

  /**
   * 全局过滤器
   *
   * @type {Object}
   */
  static filters = { }

  /**
   * 全局模板片段
   *
   * @type {Object}
   */
  static partials = { }

  /**
   * 配置项
   *
   * @param {Object} options
   * @property {string|HTMLElement} options.el
   * @property {string} options.template
   * @property {Object} options.data
   * @return {Object}
   */
  constructor(options) {

    super()

    // 生命周期钩子
    // this.hooks = { }
    // 子组件
    // this.components = { }
    // 过滤器
    // this.filters = { }
    // 模板片段
    // this.partials = { }
    // 实例方法
    // this.methods = { }
    // 监控数据变化
    // this.watchers = { }

    Object.assign(this, options)

    // 把 hooks 里的 handler 注册到事件
    if (isObject(this.hooks)) {
      objectEach(
        this.hooks,
        (name, handler) => {
          if (name.startsWith('on')) {
            this.on(name.substr(2), handler.bind(this))
          }
        }
      )
    }

    if (isString(this.el)) {
      this.el = find(this.el)
    }

    this.parser = new Mustache()

    this.templateAst = this.parser.parse(
      this.template,
      name => {
        return (this.partials && this.partials[name]) || Cola.partials[name]
      },
      (name, node) => {
        if (!this.partials) {
          this.partials = { }
        }
        this.partials[name] = node
      }
    )

    this.fire('compile')

    this.updateView()

  }

  get(keypath) {
    return objectGet(this.data, keypath)
  }

  set(keypath, value) {
    if (isObject(keypath)) {
      objectEach(keypath, (keypath, value) => {
        objectSet(this.data, keypath, value)
      })
      this.updateView()
    }
    else {
      objectSet(this.data, keypath, value)
      this.updateView()
    }
  }

  updateModel() {

  }

  updateView() {

    let newNode = create(
      this.parser.render(this.templateAst, this.data)
    )

    let eventName = this.currentNode ? 'update' : 'render'

    this.currentNode = this.currentNode
      ? update(this.currentNode, newNode)
      : init(this.el, newNode)

    this.fire(eventName)

  }

}
