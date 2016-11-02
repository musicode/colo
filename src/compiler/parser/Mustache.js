
import {
  log,
  warn,
} from '../../config/env'

import * as cache from '../../config/cache'
import * as syntax from '../../config/syntax'

import Context from '../helper/Context'
import Scanner from '../helper/Scanner'
import print from '../../function/print'
import getLocationByIndex from '../../function/getLocationByIndex'

import Attribute from '../node/Attribute'
import Directive from '../node/Directive'
import Each from '../node/Each'
import Element from '../node/Element'
import Else from '../node/Else'
import ElseIf from '../node/ElseIf'
import Expression from '../node/Expression'
import If from '../node/If'
import Import from '../node/Import'
import Partial from '../node/Partial'
import Text from '../node/Text'

import {
  IF,
  ELSE_IF,
  ELSE,
  EACH,
  DIRECTIVE,
  EXPRESSION,
  IMPORT,
  PARTIAL,
  TEXT,
  ELEMENT,
  ATTRIBUTE,
} from '../nodeType'

import {
  isArray,
  isFunction,
} from '../../util/is'

import {
  each,
  lastItem,
} from '../../util/array'

import {
  parse,
} from '../../util/expression'

const openingDelimiterPattern = /\{\{\s*/
const closingDelimiterPattern = /\s*\}\}/

const elementPattern = /<(?:\/)?[a-z]\w*/i
const elementEndPattern = /(?:\/)?>/

const selfClosingTagPattern = /input|img|br/i

const attributeSuffixPattern = /^([^"']*)["']/
const attributePattern = /([-:@a-z0-9]+)(?:=(["'])(?:([^'"]+))?)/i
const attributeValueStartPattern = /^=["']/

const componentPattern = /[-A-Z]/

const breaklinePrefixPattern = /^[ \t]*\n/
const breaklineSuffixPattern = /\n[ \t]*$/

const parsers = [
  {
    test: function (source) {
      return source.startsWith(syntax.EACH)
    },
    create: function (source, currentNode) {
      let terms = source.substr(syntax.EACH.length).trim().split(':')
      let name = terms[0].trim()
      let index
      if (terms[1]) {
        index = terms[1].trim()
      }
      return new Each(currentNode, name, index)
    }
  },
  {
    test: function (source) {
       return source.startsWith(syntax.IMPORT)
    },
    create: function (source, currentNode) {
      let name = source.substr(syntax.IMPORT.length).trim()
      if (name) {
        return new Import(currentNode, name)
      }
    }
  },
  {
    test: function (source) {
       return source.startsWith(syntax.PARTIAL)
    },
    create: function (source, currentNode) {
      let name = source.substr(syntax.PARTIAL.length).trim()
      if (name) {
        return new Partial(currentNode, name)
      }
      throw new Error('模板片段缺少名称')
    }
  },
  {
    test: function (source) {
       return source.startsWith(syntax.IF)
    },
    create: function (source, currentNode) {
      let expr = source.substr(syntax.IF.length).trim()
      if (expr) {
        return new If(currentNode, parse(expr))
      }
      throw new Error('if 缺少条件')
    }
  },
  {
    test: function (source) {
      return source.startsWith(syntax.ELSE_IF)
    },
    create: function (source, currentNode, popStack) {
      let expr = source.substr(syntax.ELSE_IF.length)
      if (expr) {
        return new ElseIf(popStack(), parse(expr))
      }
      throw new Error('else if 缺少条件')
    }
  },
  {
    test: function (source) {
      return source.startsWith(syntax.ELSE)
    },
    create: function (source, currentNode, popStack) {
      return new Else(popStack())
    }
  },
  {
    test: function (source) {
      return true
    },
    create: function (source, currentNode) {
      let safe = true
      if (source.startsWith('{')) {
        safe = false
        source = source.substr(1)
      }
      return new Expression(currentNode, parse(source), safe)
    }
  }
]

const rootName = 'root'

module.exports = class Mustache {

  /**
   * 把抽象语法树渲染成 Virtual DOM
   *
   * @param {Object} ast
   * @param {Object} data
   * @return {Object}
   */
  render(ast, data) {

    let rootElement = new Element(null, rootName)
    let rootContext = new Context(data)
    let keys = []

    // 在渲染语法树的过程中，如果发现 Element 节点是一个组件
    // 则在节点上绑定一个 create 函数
    // 在第一次渲染元素时，调用该函数，并把组件实例绑定组件元素上
    // 当组件元素销毁时，连带销毁组件实例

    // 非转义插值需要解析模板字符串
    let parseTemplate = template => {
      return this.parse(template).children
    }

    if (ast.name === rootName) {
      each(
        ast.children,
        function (child) {
          child.render(rootElement, rootContext, keys, parseTemplate)
        }
      )
    }
    else {
      ast.render(rootElement, rootContext, keys, parseTemplate)
    }

    let { children } = rootElement
    if (children.length !== 1 || children[0].type !== ELEMENT) {
      throw new Error('组件有且只能有一个根元素')
    }

    return children[0]

  }

  /**
   * 把模板解析为抽象语法树
   *
   * @param {string} template
   * @param {Function} getPartial 当解析到 IMPORT 节点时，需要获取模板片段
   * @param {Function} setPartial 当解析到 PARTIAL 节点时，需要注册模板片段
   * @return {Object}
   */
  parse(template, getComponent, getPartial, setPartial) {

    if (cache.templateParseCache[template]) {
      return cache.templateParseCache[template]
    }

    let rootNode = new Element(null, rootName)

    let currentNode = rootNode
    let lastNode
    let node

    let mainScanner = new Scanner(template)
    let helperScanner = new Scanner()

    let name
    let content

    let isComponent
    let isDirective
    let isAttributesParsing

    let match
    let errorPos

    let nodeStack = []

    let pushStack = function (node) {
      nodeStack.push(currentNode)
      currentNode = node
    }

    let popStack = function () {
      currentNode = nodeStack.pop()
      return currentNode
    }

    let isBreakLine = function (content) {
      return content.indexOf('\n') >= 0 && !content.trim()
    }
    let trimBreakline = function (content) {
      return content
      .replace(breaklinePrefixPattern, '')
      .replace(breaklineSuffixPattern, '')
    }

    let addChild = function (node) {

      lastNode = lastItem(currentNode.children)
      if (lastNode) {
        if (node.type === TEXT) {
          if (isBreakLine(node.content)) {
            return
          }
        }
        else if (lastNode.type === TEXT) {
          if (isBreakLine(lastNode.content)) {
            currentNode.children.pop()
          }
        }
      }

      if (node.type === TEXT
        && !(node.content = trimBreakline(node.content))
      ) {
        return
      }

      if (node.type === IMPORT) {
        node = getPartial(node.name)
        if (node) {
          each(node.children, addChild)
          return
        }
        else {
          return throwError(`找不到模板片段：${node.name}`)
        }
      }
      else if (node.type === PARTIAL) {
        setPartial(node.name, node)
        return
      }

      let action = 'addChild'
      if (currentNode.type === ELEMENT) {
        if (node.type === DIRECTIVE) {
          action = 'addDirective'
        }
        else if (node.type === ATTRIBUTE) {
          action = 'addAttr'
        }
        else if (isAttributesParsing) {
          action = 'addAttr'
        }
      }

      currentNode[action](node)

      if (node.children) {
        pushStack(node)
      }
    }

    let throwError = function (msg) {
      if (errorPos != null) {
        msg += '，位置 line %d, col %d。'
        let { line, col } = getLocationByIndex(template, errorPos)
        return warn(msg, line, col)
      }
      else {
        msg += '。'
        return warn(msg)
      }
    }

    // 这个函数涉及分隔符和普通模板的深度解析
    // 是最核心的函数
    let parseContent = function (content) {

      helperScanner.reset(content)

      while (helperScanner.hasNext()) {

        // 分隔符之前的内容
        content = helperScanner.nextBefore(openingDelimiterPattern)
        helperScanner.nextAfter(openingDelimiterPattern)

        if (content) {

          // 支持以下 5 种 attribute
          // name
          // {{name}}
          // name="value"
          // name="{{value}}"
          // {{name}}="{{value}}"

          if (isAttributesParsing) {

            // 当前节点是 ATTRIBUTE
            // 表示至少已经有了属性名
            if (currentNode.type === ATTRIBUTE) {

              // 走进这里，只可能是以下几种情况
              // 1. 属性名是字面量，属性值已包含表达式
              // 2. 属性名是表达式，属性值不确定是否存在

              // 当前属性的属性值是字面量结尾
              if (currentNode.children.length) {
                if (match = content.match(attributeSuffixPattern)) {
                  if (match[1]) {
                    addChild(
                      new Text(currentNode, match[1])
                    )
                  }
                  content = content.replace(attributeSuffixPattern, '')
                  popStack()
                }
              }
              else {
                // 属性值开头部分是字面量
                if (attributeValueStartPattern.test(content)) {
                  content = content.replace(attributeValueStartPattern, '')
                }
                // 没有属性值
                else {
                  popStack()
                }
              }

            }

            if (currentNode.type !== ATTRIBUTE) {
              // 下一个属性的开始
              while (match = attributePattern.exec(content)) {
                content = content.substr(match.index + match[0].length)

                isDirective = match[1].startsWith(syntax.DIRECTIVE_PREFIX)
                  || match[1].startsWith(syntax.DIRECTIVE_EVENT_PREFIX)

                addChild(
                  isDirective
                  ? new Directive(currentNode, match[1])
                  : new Attribute(currentNode, match[1])
                )

                if (match[3]) {
                  addChild(
                    new Text(currentNode, match[3])
                  )
                  // 剩下的只可能是引号了
                  if (content) {
                    popStack()
                  }
                }
                // 如 checked、disabled
                else {
                  popStack()
                }
              }
              content = ''
            }
          }

          if (content) {
            addChild(
              new Text(currentNode, content)
            )
          }
        }

        // 分隔符之间的内容
        content = helperScanner.nextBefore(closingDelimiterPattern)
        helperScanner.nextAfter(closingDelimiterPattern)

        if (content) {
          if (content.charAt(0) === '/') {
            popStack()
          }
          else {
            if (content.charAt(0) === '{' && helperScanner.charAt(0) === '}') {
              helperScanner.forward(1)
            }
            each(parsers, function (parser) {
              if (parser.test(content)) {
                node = parser.create(content, currentNode, popStack)
                // 表达式是属性名称
                if (isAttributesParsing && node.type === EXPRESSION && currentNode.type !== ATTRIBUTE) {
                  node = new Attribute(currentNode, node)
                }
                addChild(node)
                return false
              }
            })
          }
        }

      }
    }

    while (mainScanner.hasNext()) {
      content = mainScanner.nextBefore(elementPattern)

      if (content.trim()) {
        // 处理标签之间的内容
        parseContent(content)
      }

      // 接下来必须是 < 开头（标签）
      // 如果不是标签，那就该结束了
      if (mainScanner.charAt(0) !== '<') {
        break
      }

      errorPos = mainScanner.pos

      // 结束标签
      if (mainScanner.charAt(1) === '/') {
        content = mainScanner.nextAfter(elementPattern)
        name = content.substr(2)

        if (mainScanner.charAt(0) !== '>') {
          return throwError('结束标签缺少 >')
        }
        else if (name !== currentNode.name) {
          return throwError('开始标签和结束标签匹配失败')
        }

        popStack()
        mainScanner.forward(1)
      }
      // 开始标签
      else {
        content = mainScanner.nextAfter(elementPattern)
        name = content.substr(1)
        isComponent = componentPattern.test(name)

        addChild(
          new Element(currentNode, isComponent ? 'div' : name, isComponent && getComponent(name))
        )

        // 截取 <name 和 > 之间的内容
        // 用于提取 attribute
        content = mainScanner.nextBefore(elementEndPattern)
        if (content) {
          isAttributesParsing = true
          parseContent(content)
          isAttributesParsing = false
        }

        content = mainScanner.nextAfter(elementEndPattern)
        if (!content) {
          return throwError('标签缺少 >')
        }

        if (isComponent || selfClosingTagPattern.test(name)) {
          popStack()
        }
      }
    }

    if (nodeStack.length) {
      return throwError('节点没有正确的结束')
    }

    cache.templateParseCache[template] = rootNode

    return rootNode

  }

}
