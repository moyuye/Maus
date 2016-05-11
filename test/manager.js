var rpcManager = require('../src/manager');
var express = require('express');
var app = express();

app.use('/js', express.static('./'));
app.use('/', express.static('./'));
app.listen(3000);

rpcManager.create(workers => {
    console.log('task start!')
    var add = function(x, y) {
        return Promise.all([x, y])
            .then(arr => new Promise((resolve, reject) => {
                workers.add(arr[0], arr[1], result => resolve(result));
            }))
    }

    var fib = x => x > 1? add(fib(x-1), fib(x-2)) : x;

    fib(10);
}, 8124)

setTimeout(() => {
    rpcManager.start()
}, 8000);
