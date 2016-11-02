
module.exports = function camelCase(name) {
  return name.replace(
    /-([a-z])/gi,
    function ($0, $1) {
      return $1.toUpperCase()
    }
  )
}
