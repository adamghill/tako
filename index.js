var Application = require('./application')
  , Router = require('./router')
  ;

module.exports = function (options) {
  return new Application(options)
}

module.exports.router = function (hosts) {return new Router(hosts)}