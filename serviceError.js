function ServiceError(msg) {
  this.message = msg	
 	Error.captureStackTrace(this, ServiceError)
}

util.inherits(ServiceError, Error)
ServiceError.prototype.name = 'ServiceError'

module.exports = ServiceError