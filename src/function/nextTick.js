let nextTick

if (typeof MutationObserver === 'function') {
  nextTick = function (fn) {
    let observer = new MutationObserver(fn)
    let textNode = document.createTextNode('')
    observer.observe(textNode, {
      characterData: true,
    })
    textNode.data = ' '
  }
}
else if (typeof setImmediate === 'function') {
  nextTick = function (fn) {
    setImmediate(fn)
  }
}
else {
  nextTick = function (fn) {
    setTimeout(fn)
  }
}

module.exports = nextTick
