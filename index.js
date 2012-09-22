var Application = require('./application')
  , JSONRequestHandler = require('./jsonRequestHandler')
  , ServiceError = require('./serviceError')
  , Router = require('./router')
  ;

module.exports = function (options) {
  return new Application(options)
}

module.exports.JSONRequestHandler = JSONRequestHandler

module.exports.ServiceError = ServiceError

module.exports.router = function (hosts) {return new Router(hosts)}