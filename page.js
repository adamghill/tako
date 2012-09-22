var util = require('util')
  , stream = require('stream')
  ;

function Page (templatename) {
  var self = this
  self.promises = {}
  self.counter = 0
  self.results = {}
  self.dests = []

  self.on('pipe', function (src) {
    if (src.method && (src.method === 'PUT' || src.method == 'POST')) {
      var p = self.promise('body')
      src.on('error', function (e) {
        p(e)
      })
      src.on('body', function (body) {
        p(null, body)
      })
      if (src.json) {
        var jp = self.promise('json')
        src.on('json', function (obj) {
          jp(null, obj)
        })
      }
    }
  })

  process.nextTick(function () {
    if (self.listeners('error').length === 0) {
      self.on('error', function (err) {
        if (self.dests.length) {
          self.dests.forEach(function (resp) {
            if (resp.error) return resp.error(err)
          })
        } else {
          self.application.logger.error('Page::Uncaught Error:')
          self.application.logger.error(e)
        }
      })
    }
    
    if (templatename) {
      self.template(templatename)
    }

    if (self.counter === 0) self.emit('finish', self.results)
  })
}

util.inherits(Page, stream.Stream)

Page.prototype.promise = function (name, cb) {
  if (name === 'error') throw new Error("You cannot name a promise 'error'")
  if (name === 'finish') throw new Error("You cannot name a promise 'finish'")
  if (name === 'resolved') throw new Error("You cannot name a promise 'resolved'")
  var self = this;
  self.counter += 1
  self.promises[name] = function (e, result) {
    self.emit('resolved', name, e, result)
    if (e) {
      e.promise = name
      return self.emit('error', e, name)
    }
    self.emit(name, result)
    self.results[name] = result
    self.counter = self.counter - 1
    if (self.counter === 0) self.emit('finish', self.results)
  }
  if (cb) self.on(name, cb)
  return self.promises[name]
}

Page.prototype.event = function (name, cb) {
  var p = this.promise(name, cb)
    , r = function (r) { p(null, r) }
    ;
  return r
}

Page.prototype.pipe = function (dest) {
  this.dests.push(dest)
}

Page.prototype.write = function () {}

Page.prototype.end = function () {}

Page.prototype.destroy = function () {}

module.exports = Page