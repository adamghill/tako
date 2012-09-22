var http = require('http')
  , https = require('https')
  ;

function Router (hosts, options) {
  var self = this
  self.hosts = hosts || {}
  self.options = options || {}
  
  function makeHandler (type) {
    var handler = function (req, resp) {
      var host = req.headers.host
      if (!host || !self.hosts[host]) {
        if (!self._default) {
          resp.writeHead(404, {'content-type':'text/plain'})
          resp.end('No host header.')
        } else {
          self._default.httpServer.emit(type, req, resp)
        }
        return
      }
      self.hosts[host].httpServer.emit(type, req, resp)
    }
    return handler
  }
  
  self.httpServer = http.createServer()
  self.httpsServer = https.createServer(self.options.ssl || {})
  
  self.httpServer.on('request', makeHandler('request'))
  self.httpsServer.on('request', makeHandler('request'))
  
  self.httpServer.on('upgrade', makeHandler('upgrade'))
  self.httpsServer.on('upgrade', makeHandler('upgrade'))
}

Router.prototype.host = function (host, app) {
  this.hosts[host] = app
}

Router.prototype.default = function (app) {
  this._default = app
}

Router.prototype.close = function (cb) {
  var counter = 1
    , self = this
    ;
  function end () {
    counter = counter - 1
    if (counter === 0 && cb) cb()
  }
  if (self.httpServer._handle) {
    counter++
    self.httpServer.once('close', end)
    self.httpServer.close()
  }
  if (self.httpsServer._handle) {
    counter++
    self.httpsServer.once('close', end)
    self.httpsServer.close()
  }
  
  for (var host in self.hosts) {
    counter++
    process.nextTick(function () {
      self.hosts[host].close(end)
    })
    
  }
  end()
}

module.exports = Router