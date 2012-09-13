var util = require('util')
  , events = require('events')
  , fs = require('fs')
  , path = require('path')
  , handlebars = require('./handlebars')
  ;

// Templates implementation
function Templates (app) {
  this.files = {}
  this.loaded = true
  this.after = {}
  this.app = app
  this.names = {}
  this.loading = 0
  this.tempcache = {}
  
  this.Template = function (text) {
    this.compiled = handlebars.compile(text)
  }

  this.Template.prototype.render = function (obj) {
    return new Buffer(this.compiled(obj))
  }
}

util.inherits(Templates, events.EventEmitter)

Templates.prototype.get = function (name, cb) {
  var self = this
  
  if (name.indexOf(' ') !== -1 || name[0] === '<') {
    process.nextTick(function () {
      if (!self.tempcache[name]) {
        self.tempcache[name] = new self.Template(name)
      }
      cb(null, self.tempcache[name])
    })
    return
  }
  
  function finish () {
    if (name in self.names) {
      if (self.cache) {
        cb(null, self.files[self.names[name]])
      }
      else {
        fs.readFile(self.names[name], function (e, data) {
          if (e) { 
            cb(e)
          } else {
            var t = new self.Template(data.toString())
            cb(null, t)
          }
        })
      }
    } else {
      cb(new Error("Cannot find template"))
    }
  }
  
  if (this.loaded) {
    process.nextTick(finish)
  } else {
    self.once('loaded', finish)
  }
}

Templates.prototype.directory = function (dir, options) {
  var self = this
  self.dir = dir
  if (!options) options = { cache: true } 
  self.cache = options.cache
  self.filter = options.filter
  this.loaded = false
  this.loading += 1

  loadfiles(dir, function (e, filemap) {
    if (e) return self.emit('error', e)
    for (i in filemap) {
      self.files[i] = new self.Template(filemap[i])
      self.names[path.basename(i)] = i
      self.names[path.basename(i, path.extname(i))] = i
    }
    self.loading -= 1
    self.loaded = true
    if (self.loading === 0) self.emit('loaded')
  })
} 

function loadfiles (f, cb) {
  var filesmap = {}
  fs.readdir(f, function (e, files) {
    if (e) return cb(e)
    var counter = 0
    files.forEach(function (filename) {
      counter += 1
      fs.stat(path.join(f, filename), function (e, stat) {
        if (stat.isDirectory()) {
          loadfiles(path.join(f, filename), function (e, files) {
            if (e) return cb(e)
            for (i in files) {
              filesmap[i] = files[i]
            }
            counter -= 1
            if (counter === 0) cb(null, filesmap)
          })
        } else {
          fs.readFile(path.join(f, filename), function (e, data) {
            filesmap[path.join(f, filename)] = data.toString()
            counter -= 1
            if (counter === 0) cb(null, filesmap)
          })
        }
      })
    })
  })
}

exports.Templates = Templates