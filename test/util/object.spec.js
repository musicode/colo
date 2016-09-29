
import * as object from '../../src/util/object'

describe('util/object', () => {
  it('each callback params', () => {
    let key = 'a'
    let value = 1
    let test = {
      [key]: value
    }
    let firstIsValue = false
    let secondIsKey = false
    object.each(test, (v, k) => {
      if (value === v) {
        firstIsValue = true
      }
      if (key === k) {
        secondIsKey = true
      }
    })
    expect(firstIsValue).toBe(true)
    expect(secondIsKey).toBe(true)
  })

  it('each interrupt', () => {
    let test = {
      a: 'a',
      b: 'b',
      c: 'c',
    }
    let index = 0
    object.each(test, (value, key) => {
      index++
      if (key === 'b') {
        return false
      }
    })
    expect(index).not.toBe(3)
  })

  it('has', () => {
    let test1 = {}
    let test2 = { a: 1 }
    expect(object.has(test1, 'a')).toBe(false)
    expect(object.has(test1, 'toString')).toBe(false)
    expect(object.has(test2, 'a')).toBe(true)
    expect(object.has(test2, 'toString')).toBe(false)
  })

  it('get', () => {
    let test = {
      user: {
        name: 'musicode',
        age: 1,
        extra: {
          married: false
        }
      }
    }
    expect(object.get(test, 'user')).toBe(test.user)
    expect(object.get(test, 'user.name')).toBe(test.user.name)
    expect(object.get(test, 'user.haha')).toBe(test.user.haha)
    expect(object.get(test, 'other.name')).toBe(undefined)
    expect(object.get(test, 'user.extra.married')).toBe(test.user.extra.married)
  })

  it('set', () => {
    let test = {
      user: {
        name: 'musicode',
        age: 1,
        extra: {
          married: false
        }
      }
    }
    object.set(test, 'user.name', 'haha')
    expect(object.get(test, 'user.name')).toBe('haha')

    object.set(test, 'a.b', 'haha', true)
    expect(object.get(test, 'a.b')).toBe('haha')

  })
})
