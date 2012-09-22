var crypto = require('crypto')
  , rfc822 = require('./rfc822')
  ;

function BufferResponse (buffer, mimetype) {
  if (!Buffer.isBuffer(buffer)) this.body = new Buffer(buffer)
  else this.body = buffer
  this.timestamp = rfc822.getRFC822Date(new Date())
  this.etag = crypto.createHash('md5').update(buffer).digest("hex")
  this.mimetype = mimetype
  this.cache = true
}

BufferResponse.prototype.request = function (req, resp) {
  if (resp._header) return // This response already started
  resp.setHeader('content-type', this.mimetype)
  if (this.cache) {
    resp.setHeader('last-modified',  this.timestamp)
    resp.setHeader('etag', this.etag)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    resp.statusCode = 405
    return (resp._end ? resp._end : resp.end).call(resp)
  }
  if (this.cache && 
      req.headers['if-none-match'] === this.etag ||
      req.headers['if-modified-since'] === this.timestamp
      ) {
    resp.statusCode = 304
    return (resp._end ? resp._end : resp.end).call(resp)
  }
  resp.statusCode = this.statusCode || 200
  ;(resp._write ? resp._write : resp.write).call(resp, this.body)
  return (resp._end ? resp._end : resp.end).call(resp)
}

module.exports = BufferResponse