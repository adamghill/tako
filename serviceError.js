function ServiceError(msg) {
  Error.apply(this, arguments)
  this.message = msg 
  this.stack = (new Error()).stack;
}

ServiceError.prototype = new Error()

ServiceError.prototype.constructor = ServiceError

ServiceError.prototype.name = 'ServiceError'

module.exports = ServiceError