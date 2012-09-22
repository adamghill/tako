function JSONRequestHandler (req, resp) {
  var orig = resp.write

  resp.write = function (chunk) {
    if (resp._header) return orig.call(this, chunk) // This response already started
    // bail fast for chunks to limit impact on streaming
    if (Buffer.isBuffer(chunk)) return orig.call(this, chunk)
    // if it's an object serialize it and set proper headers
    if (typeof chunk === 'object') {
      chunk = new Buffer(JSON.stringify(chunk))
      resp.setHeader('content-type', 'application/json')
      resp.setHeader('content-length', chunk.length)
      if (!resp.statusCode && (req.method === 'GET' || req.method === 'HEAD')) {
        resp.statusCode = 200
      }
    }
    return orig.call(resp, chunk)
  }

  if (req.method === "PUT" || req.method === "POST") {
    if (req.headers['content-type'] && (req.headers['content-type'].split(';')[0] === 'application/json')) {
      req.on('body', function (body) {
        try {
          req.emit('json', JSON.parse(body));
        } catch (e) {
          req.emit('error', e);
        }
      })
    }
  }
}

module.exports = JSONRequestHandler