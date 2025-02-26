const net = require("net")

/**
 * Creates a wrapper from net.Socket
 * @param {*} socket 
 * @returns conn object 
 */ 
function soInit(socket) {
    const conn = {
        socket: socket,
        reader: null,
        err: null,
        ended: false
    }

    socket.on('data', (data) => {
        console.assert(conn.reader)
        // pause the data object until the next read
        conn.socket.pause()
        // fufill the promise of the current read
        conn.reader.resolve(data)
        conn.reader = null
    })

    socket.on("end", () => {
        // errors are also delivered on the read
        conn.ended = true

        if (conn.reader) {
            conn.reader.resolve(Buffer.from('')) //EOF (End of file)
            conn.reader = null

        }
    })
    socket.on('error', (err) => {
        // errors are also delivered on the read
        conn.err = err

        if (conn.reader) {
            conn.reader.reject(err)
            conn.reader = null
        }
    })
    return conn;
}

/**The soRead function returns a promise which is resolved with socket data. It depends on 3 events.
1) The 'data' event fulfills the promise.
2) While reading a socket, we also need to know if the EOF has occurred. So the 'end' event also fulfills the promise. A common way to indicate the EOF is to return zero-length data.
3) There is also the 'error' event, we want to reject the promise when this happens, otherwise, the promise hangs forever.
@param {*} conn
@returns returns an empty "Buffer" after EOF
*/
function soRead(conn) {
    console.assert(!conn.reader) // no concurrent calls

    if (conn.err) {
        reject(conn.err)
        return
    }

    if (conn.ended) {
        resolve(Buffer.from(''))
        return
    }

    return new Promise((resolve, reject) => {
        // save promise callback
        conn.reader = { resolve, reject }
        // resume data event to fufill promise later
        conn.socket.resume()
    })
}

/**
 * soWrite method accepts a callback to notify completion of the write. Conversion to promise is trivial
 * @param {*} conn 
 * @param {*} data 
 * @returns 
 */
function soWrite(conn, data) {
    console.assert(data.length > 0)
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(err)
            return
        }
        conn.socket.write(data, (err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
}

/**
 * Handler for new incoming connections
 * @param {*} socket 
 */
async function newConn(socket) {
    console.log(`New connection established at ${socket.remoteAddress} on port ${socket.remotePort}`)
    try {
        await serveClient(socket)
    } catch (error) {
        console.log(`exception: ${error}`)
    } finally {
        socket.destroy()
    }
}

/**
 * Echo server
 * @param {*} socket 
 */
async function serveClient(socket) {
    const conn = soInit(socket)
    while (true) {
        const data = await soRead(conn)
        if (data.length === 0) {
            console.log("Ending connection")
            break
        }
        console.log(`Data: ${data}`)
        await soWrite(conn, data)
    }
}

function soListen() {
    const server = net.createServer()
    const listener = {
        server: server,
        host: "localhost",
        port: 5556,
    }
    return new Promise((resolve, reject) => {
        server.listen(listener.port, listener.host, (err) => {
            if (err) {
                reject(err)
            } else {
                console.log(`Server listening at ${listener.host} at ${listener.port}`)
                resolve(listener.server)
            }
        })
    })
}

function soAccept(listener) {
    return new Promise((resolve) => {
        listener.once('connection', (socket) => {
            console.log(`New Client connected at ${socket.remoteAddress} at ${socket.remotePort}`)
            resolve(socket)
        })
        })
}

async function main() {
    const listen = await soListen()
    while (true) {
        const socket = await soAccept(listen)
        newConn(socket)
    }
}

main().catch(console.error)