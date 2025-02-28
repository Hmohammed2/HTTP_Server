const net = require('net')

let server = net.createServer((socket) => {
    console.log('new connection')

    socket.on("data" , connData)
    socket.once("close", connClose)
    socket.on('error', connErr)

    function connData(d) {
        socket.write(d)
    }
    function connClose() {
        console.log(`Connection closed at ${socket.remoteAddress} on port ${socket.remotePort}`)
    }
    function connErr(err) {
        console.log(`Connection error found: ${err.message}`)
    }
    
})

server.listen(5555, 'localhost', () => console.log("Listening on port 5555"))