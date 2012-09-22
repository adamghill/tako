var util = require('util')
  , events = require('events')
  , path = require('path')
  , url = require('url')
  , filed = require('filed')
  , BufferResponse = require('./bufferResponse')
  ;

var cap = function (stream, limit) {
  if (!limit) limit = Infinity
  stream.caplimit = limit
  stream.bufferedData = []
  stream.bufferedLength = 0

  stream._capemit = stream.emit
  stream.emit = function () {
    if (arguments[0] === 'data') {
      stream.bufferedData.push(arguments)
      stream.bufferedLength += arguments[1].length
      if (stream.bufferedLength > stream.caplimit) {
        stream.pause()
      }
    } else if (arguments[0] === 'end') {
      stream.ended = true
    } else {
      stream._capemit.apply(stream, arguments)
    }
  }

  stream.release = function () {
    stream.emit = stream._capemit
    while (stream.bufferedData.length) {
      stream.emit.apply(stream, stream.bufferedData.shift())
    }
    if (stream.ended) stream.emit('end')
    if (stream.readable) stream.resume()
  }

  return stream
}

function Route (path, application) {
  // This code got really crazy really fast.
  // There are a lot of different states that close out of other logic.
  // This could be refactored but it's hard because there is so much
  // cascading logic.
  var self = this
  self.path = path
  self.app = application
  self.byContentType = {}

  var returnEarly = function (req, resp, keys, authHandler) {
    if (self._events && self._events['request']) {
      if (authHandler) {
        cap(req)
        authHandler(req, resp, function (user) {
          if (resp._header) return // This response already started
          req.user = user
          if (self._must && self._must.indexOf('auth') !== -1 && !req.user) {
            resp.statusCode = 403
            resp.setHeader('content-type', 'application/json')
            resp.end(JSON.stringify({error: 'This resource requires auth.'}))
            return
          }
          self.emit('request', req, resp)
          req.release()
        })
      } else {
        if (resp._header) return // This response already started
        if (self._must && self._must.indexOf('auth') !== -1 && !req.user) {
          resp.statusCode = 403
          resp.setHeader('content-type', 'application/json')
          resp.end(JSON.stringify({error: 'This resource requires auth.'}))
          return
        }
        self.emit('request', req, resp)
      }
    } else {
      if (resp._header) return // This response already started
      resp.statusCode = 406
      resp.setHeader('content-type', 'text/plain')
      resp.end('Request does not include a valid mime-type for this resource: '+keys.join(', '))
    }
  }

  self.handler = function (req, resp, authHandler) {
    if (self._methods && self._methods.indexOf(req.method) === -1) {
      resp.statusCode = 405
      resp.end('Method not Allowed.')
      return
    }
    
    self.emit('before', req, resp)
    if (self.authHandler) {
      authHandler = self.authHandler
    }

    var keys = Object.keys(self.byContentType).concat(['*/*'])
    if (keys.length) {
      if (req.method !== 'PUT' && req.method !== 'POST') {
        var cc = req.accept.apply(req, keys)
      } else {
        var cc = req.headers['content-type'].split(';')[0];
      }

      if (!cc) return returnEarly(req, resp, keys, authHandler)
      if (cc === '*/*') {
        var h = this.byContentType[Object.keys(this.byContentType)[0]]
      } else {
        var h = this.byContentType[cc]
      }
      if (!h) return returnEarly(req, resp, keys, authHandler)
      if (resp._header) return // This response already started
      resp.setHeader('content-type', cc)

      var run = function () {
        if (h.request) {
          return h.request(req, resp)
        }
        if (h.pipe) {
          req.pipe(h)
          h.pipe(resp)
          return
        }
        h.call(req.route, req, resp)
      }

      if (authHandler) {
        cap(req)
        authHandler(req, resp, function (user) {
          req.user = user
          if (self._must && self._must.indexOf('auth') !== -1 && !req.user) {
            if (resp._header) return // This response already started
            resp.statusCode = 403
            resp.setHeader('content-type', 'application/json')
            resp.end(JSON.stringify({error: 'This resource requires auth.'}))
            return
          }
          run()
          req.release()
        })
      } else {
        if (resp._header) return // This response already started
        if (self._must && self._must.indexOf('auth') !== -1) {
          resp.statusCode = 403
          resp.setHeader('content-type', 'application/json')
          resp.end(JSON.stringify({error: 'This resource requires auth.'}))
          return
        }
        run()
      }

    } else {
      returnEarly(req, resp, keys, authHandler)
    }
  }
  application.emit('newroute', self)
}

util.inherits(Route, events.EventEmitter)

Route.prototype.json = function (cb) {
  if (Buffer.isBuffer(cb)) cb = new BufferResponse(cb, 'application/json')
  else if (typeof cb === 'object') cb = new BufferResponse(JSON.stringify(cb), 'application/json')
  else if (typeof cb === 'string') {
    if (cb[0] === '/') cb = filed(cb)
    else cb = new BufferResponse(cb, 'application/json')
  }
  this.byContentType['application/json'] = cb
  return this
}

Route.prototype.html = function (cb) {
  if (Buffer.isBuffer(cb)) cb = new BufferResponse(cb, 'text/html')
  else if (typeof cb === 'string') {
    if (cb[0] === '/') cb = filed(cb)
    else cb = new BufferResponse(cb, 'text/html')
  }
  this.byContentType['text/html'] = cb
  return this
}

Route.prototype.text = function (cb) {
  if (Buffer.isBuffer(cb)) cb = new BufferResponse(cb, 'text/plain')
  else if (typeof cb === 'string') {
    if (cb[0] === '/') cb = filed(cb)
    else cb = new BufferResponse(cb, 'text/plain')
  }
  this.byContentType['text/plain'] = cb
  return this
}

Route.prototype.file = function (filepath) {
  this.on('request', function (req, resp) {
    var f = filed(filepath)
    req.pipe(f)
    f.pipe(resp)
  })
  return this
}

Route.prototype.files = function (filepath) {
  this.on('request', function (req, resp) {
    req.route.extras.unshift(filepath)
    var p = path.join.apply(path.join, req.route.extras)
    if (p.slice(0, filepath.length) !== filepath) {
      resp.statusCode = 403
      return resp.end('Naughty Naughty!')
    }
    var f = filed(p)
    req.pipe(f)
    f.pipe(resp)
  })
  return this
}

Route.prototype.auth = function (handler) {
  if (!handler) return this.authHandler
  this.authHandler = handler
  return this
}

Route.prototype.must = function () {
  this._must = Array.prototype.slice.call(arguments)
  return this
}

Route.prototype.methods = function () {
  this._methods = Array.prototype.slice.call(arguments)
  return this
}

module.exports = Route