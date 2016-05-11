var uuid = require('node-uuid');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

function jsonRpcData(message, body) {
    this.id = uuid.v4();
    this.message = message;
    this.body = body;
}

var rpcManager = {
    __workerList: {},
    __callbackStore: {},
    __functionCallQueue: [],
    create: function(callback, port) {
        this.__workersStaticCallback = callback;
        io.on('connection', worker => {
            console.log('worker connected');
            var workerID = uuid.v4();
            this.__workerList[workerID] = {
                isBusy: false,
                socket: worker
            };
            worker.on('data', data => {
                console.log('recieve data:', data);
                this.__handleData(data, workerID);
            });
            worker.on('disconnect', () => {
                delete this.__workerList[workerID];
            });
            this.__init(workerID);
        })
        server.listen(port);
    },
    __init: function(workerID) {
        var data = new jsonRpcData('init');
        this.__send(data, workerID);
    },
    __handleData: function(data, workerID) {
        switch (data.message) {
            case 'init':
                var workers = {
                    __send: this.__send.bind(this),
                    __functionCall: this.__functionCall.bind(this)
                };
                var funcNames = data.body;
                funcNames.forEach(funcName => {
                    workers[funcName] = new Function(`
                        console.log("call ${funcName}");
                        var params = Array.prototype.slice.call(arguments,0,arguments.length-1);
                        var callback = arguments[arguments.length-1];
                        this.__functionCall('${funcName}',params,callback);
                    `)
                })
                this.__workers = workers;
                if (this.__waitingForInit) {
                    this.start();
                }
                this.__digest(workerID);
                break;
            case 'function call':
                var result = data.body.result;
                var id = data.id;
                this.__callbackStore[id](result);
                this.__clearCallback(id);

                //检查队列中是否有等待的任务
                this.__digest(workerID);
                break;
        }
    },
    start: function(callback) {
        if (this.__workers != undefined) {
            this.__workersStaticCallback(this.__workers);
            this.__waitingForInit = false;
        } else {
            this.__waitingForInit = true;
        }
    },
    __send: function(data, workerID) {
        this.__workerList[workerID].socket.emit('data', data);
    },
    __digest: function(workerID) {
        if (this.__functionCallQueue.length > 0) {
            this.__send(this.__functionCallQueue.shift(), workerID);
        } else {
            this.__workerList[workerID].isBusy = false;
        }
    },
    __functionCall: function(funcName, params, callback) {
        var data = new jsonRpcData('function call', {
            funcName: funcName,
            params: params
        });
        this.__registerCallback(data.id, callback);

        for (var workerID in this.__workerList) {
            if (!this.__workerList[workerID].isBusy) {
                this.__send(data, workerID);
                this.__workerList[workerID].isBusy = true;
                return;
            }
        }
        //所有worker都繁忙
        this.__functionCallQueue.push(data);
    },
    __registerCallback: function(id, callback) {
        this.__callbackStore[id] = callback;
    },
    __clearCallback: function(id) {
        delete this.__callbackStore[id];
    }
}

module.exports = rpcManager;
