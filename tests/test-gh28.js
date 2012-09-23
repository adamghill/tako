var tako = require('../index')
  , request = require('request')
  , assert = require('assert')
  , fs = require('fs')
  ;

var t = tako()
t
  .route('/')
    .json(function (req, resp) {
      resp.end({text:'hello world'})
    })
    .html(function (req, resp) {
      resp.end('<html><body>Hello World</body></html>')
    })
    .on('request', function (req, resp) {
      resp.statusCode = 200
      resp.setHeader('content-type', 'text/plain')
      resp.end('hello')
    })

var url = 'http://localhost:8000/'

counter = 0

function end () {
  counter--
  if (counter === 0) t.close()
}

t.httpServer.listen(8000, function () {
  counter++
  
  request.put(url, function (e, resp, body) {
    if (e) throw e
    console.log('Passed PUT with no headers')
    end()
  })
})