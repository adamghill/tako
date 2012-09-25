var util = require('util')
  , events = require('events')
  , http = require('http')
  , https = require('https')
  , url = require('url')
  , fs = require('fs')
  , mapleTree = require('mapleTree')
  , Templates = require('./templates')
  , JSONRequestHandler = require('./jsonRequestHandler')
  , Route = require('./route')
  , BufferResponse = require('./bufferResponse')
  , io = null
  ;

try {
  io = require('socket.io')
} catch (er) {
  // oh well, no socket.io.
}

function Application (options) {
  var self = this
  if (!options) options = {}
  self.options = options
  self.addHeaders = {}
  if (self.options.logger) {
    self.logger = self.options.logger
  }

  self.router = new mapleTree.RouteTree()
  self.on('newroute', function (route) {
    self.router.define(route.path, function (req, resp, authHandler){
      route.handler(req, resp, authHandler)
    }) 
  })
  
  self.templates = new Templates(self)
  
  // Default to having json enabled
  self.on('request', JSONRequestHandler)
  
  // setup servers
  self.http = options.http || {}
  self.https = options.https || {}
  if (io) {
    self.socketio = options.socketio === undefined ? {} : options.socketio
    if (!self.socketio.logger && self.logger) {
      self.socketio.logger = self.logger
    }
  } else if (options.socketio) {
    throw new Error('socket.io is not available');
  }
  
  self.httpServer = http.createServer()
  self.httpsServer = https.createServer(self.https)
  self.httpServer.on('request', self.onRequest.bind(self))
  self.httpsServer.on('request', self.onRequest.bind(self))
  
  var _listenProxied = false
  var listenProxy = function () {
    if (!_listenProxied && self._ioEmitter) self._ioEmitter.emit('listening')
    _listenProxied = true
  }
  
  self.httpServer.on('listening', listenProxy)
  self.httpsServer.on('listening', listenProxy)
  
  if (io && self.socketio) {
    // setup socket.io
    self._ioEmitter = new events.EventEmitter()
    
    self.httpServer.on('upgrade', function (request, socket, head) {
      self._ioEmitter.emit('upgrade', request, socket, head)
    })
    self.httpsServer.on('upgrade', function (request, socket, head) {
      self._ioEmitter.emit('upgrade', request, socket, head)
    })
    
    self.socketioManager = new io.Manager(self._ioEmitter, self.socketio)
    self.sockets = self.socketioManager.sockets
  }
  
  if (!self.logger) {
    self.logger = 
      { log: console.log
      , error: console.error
      , info: function () {}
      }
  }
}

util.inherits(Application, events.EventEmitter)

Application.prototype.onRequest = function (req, resp) {
  var self = this
  if (self.logger.info) self.logger.info('Request', req.url, req.headers)
  // Opt out entirely if this is a socketio request
  if (self.socketio && req.url.slice(0, '/socket.io/'.length) === '/socket.io/') {
    return self._ioEmitter.emit('request', req, resp)
  }
  
  for (var header in self.addHeaders) {
    resp.setHeader(header, self.addHeaders[header])
  }
  
  req.accept = function () {
    if (!req.headers.accept) return '*/*'
    var cc = null
    var pos = 99999999
    for (var i=arguments.length-1;i!==-1;i--) {
      var ipos = req.headers.accept.indexOf(arguments[i])
      if ( ipos !== -1 && ipos < pos ) cc = arguments[i]
    }
    return cc
  }

  resp.error = function (err) {
    if (typeof(err) === "string") err = {message: err}
    if (!err.statusCode) err.statusCode = 500
    resp.statusCode = err.statusCode || 500
    self.logger.log('error %statusCode "%message "', err)
    resp.end(err.message || err) // this should be better
  }
  
  resp.notfound = function (log) {
    if (log) self.logger.log(log)
    self.notfound(req, resp)
  }

  // Get all the parsed url properties on the request
  // This is the same style express uses and it's quite nice
  var parsed = url.parse(req.url)
  for (var i in parsed) {
    req[i] = parsed[i]
  }
  
  if (req.query) req.qs = qs.parse(req.query)

  req.route = self.router.match(req.pathname)

  if (!req.route || !req.route.perfect) return self.notfound(req, resp)

  req.params = req.route.params

  var onWrites = []
  resp._write = resp.write
  resp.write = function () {
    if (resp.statusCode === 404 && self._notfound) {
      return self._notfound.request(req, resp)
    }
    if (onWrites.length === 0) return resp._write.apply(resp, arguments)
    var args = arguments
    onWrites.forEach(function (onWrite) {
      var c = onWrite.apply(resp, args)
      if (c !== undefined) args[0] = c
    })
    return resp._write.apply(resp, args)
  }

  // Fix for node's premature header check in end()
  resp._end = resp.end
  resp.end = function (chunk) {
    if (resp.statusCode === 404 && self._notfound) {
      return self._notfound.request(req, resp)
    }
    if (chunk) resp.write(chunk)
    resp._end()
    self.logger.info('Response', resp.statusCode, req.url, resp._headers)
  }

  self.emit('request', req, resp)


  req.route.fn.call(req.route, req, resp, self.authHandler)

  if (req.listeners('body').length) {
    var buffer = ''
    req.on('data', function (chunk) {
      buffer += chunk
    })
    req.on('end', function (chunk) {
      if (chunk) buffer += chunk
      req.emit('body', buffer)
    })
  }
}

Application.prototype.addHeader = function (name, value) {
  this.addHeaders[name] = value
}

Application.prototype.route = function (path, cb) {
  var r = new Route(path, this)
  if (cb) r.on('request', cb)
  return r
}

Application.prototype.middle = function (mid) {
  throw new Error('Middleware is dumb. Just listen to the app "request" event.')
}

Application.prototype.listen = function (createServer, port, cb) {
  var self = this
  if (!cb) {
    cb = port
    port = createServer
  }
  self.server = createServer(function (req, resp) {
    self.onRequest(req, resp)
  })
  self.server.listen(port, cb)
  return this
}

Application.prototype.close = function (cb) {
  var counter = 1
    , self = this
    ;
  function end () {
    counter = counter - 1
    self.emit('close')
    if (io && self.socketio) {
      self._ioEmitter.emit('close')
    }
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
  end()
  return self
}

Application.prototype.notfound = function (req, resp) {
  if (!resp) {
    if (typeof req === "string") {
      if (req[0] === '/') req = new BufferResponse(fs.readFileSync(req), 'text/html')
      else req = new BufferResponse(req, 'text/html')
    } else if (typeof req === "function") {
      this._notfound = {}
      this._notfound.request = function (r, resp) {
        if (resp._write) resp.write = resp._write
        if (resp._end) resp.end = resp._end
        req(r, resp)
      }
      return
    } else if (typeof req === 'object') {
      req = new BufferResponse(JSON.stringify(req), 'application/json')
    }
    req.statusCode = 404
    req.cache = false
    this._notfound = req
    return
  }
  
  if (resp._header) return // This response already started
  
  if (this._notfound) return this._notfound.request(req, resp)
  
  var cc = req.accept('text/html', 'application/json', 'text/plain', '*/*') || 'text/plain'
  if (cc === '*/*') cc = 'text/plain'
  resp.statusCode = 404
  resp.setHeader('content-type', cc)
  var body = 'Not Found'
  
  if (cc === 'text/html') {
    body = '<html><body>Not Found</body></html>'
  } else if (cc === 'application/json') {
    body = JSON.stringify({status:404, reason:'not found', message:'not found'})
  }

  resp.end(body)
}

Application.prototype.auth = function (handler) {
  if (!handler) return this.authHandler
  this.authHandler = handler
}

Application.prototype.page = function () {
  var page = new Page()
    , self = this
    ;
  page.application = self
  page.template = function (name) {    
    var p = page.promise("template")
    self.templates.get(name, function (e, template) {
      if (e) return p(e)
      if (p.src) p.src.pipe(template)
      page.on('finish', function () {
        process.nextTick(function () {
          var text = template.render(page.results)
          page.dests.forEach(function (d) {
            if (d._header) return // Don't try to write to a response that's already finished
            if (d.writeHead) {
              d.statusCode = 200
              d.setHeader('content-type', page.mimetype || 'text/html')
              d.setHeader('content-length', text.length)
            }
            d.write(text)
            d.end()
          })
        })
      })
      p(null, template)
    })
  }
  return page
}

module.exports = Application