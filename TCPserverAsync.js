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
        // pause the data object until the next read. Implements a concept called backpressure to stop the overflow of data from producer to client
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
 * Append data into a dynamic buffer
 */
function bufPush(buf, data) {
    const newLen = buf.length + data.length
    if (buf.data.length < newLen) {
        // grow capacity by power of two
        let cap = Math.max(buf.data.length, 32)
        while (cap < newLen) {
            cap *= 2
        }
        const grown = Buffer.alloc(cap)
        buf.data.copy(grown, 0, 0)
        buf.data = grown
        /*
        Buffer.alloc(cap) creates a new buffer of a given size. This is for resizing the buffer. 
        The new buffer has to grow exponentially so that the amortized cost is O(1). 
        We’ll use power of two series for the buffer capacity.
        */
    }
    data.copy(buf.data, buf.length, 0)
    buf.length = newLen
}
/**
    * The cutMessage() function tells if the message is complete.
    * It returns null if not. Otherwise, it removes the message and returns it. The function tests if the message is complete using the delimiter '\n'
    * @returns a copy of the message data
 */
function cutMessage(buf) {
    // messages separated by \n 
    const idx = buf.data.subarray(0 , buf.length).indexOf("\n")
    if (idx < 0) {
        return null
    }
    // buf.subarray() returns reference of a subarray without copying. Buffer.from() creates a new buffer by copying the data from the source.
    const msg = Buffer.from(buf.data.subarray(0 , idx+1))
    bufPop(buf, idx+1)
    return msg
}

/**
 * removes data from the front of the buffer
 */
function bufPop(buf, len) {
    // buf.copyWithin(dst, src_start, src_end) copies data within a buffer, source and destination can overlap, like memmove() in C.
    buf.data.copyWithin(0, len, buf.length)
    buf.length-=len;
}

/**
    *   Echo server. Parses and removes the complete message from the incoming byte stream.
    *   Append some data to the buffer.
    *   Continue the loop if the message is incomplete.
    *   Handle the message.
    *   Sends the response.
 * @param {*} socket 
 */
async function serveClient(socket) {
    const conn = soInit(socket)
    const buf = { data: Buffer.alloc(0), length: 0}
    while (true) {
        const msg = cutMessage(buf)
        if (!msg) {
            const data = await soRead(conn)
            bufPush(buf, data)

            if (data.length === 0) {
                return
            }
            // got some data try again
            continue
        }

        // process the message and send the response
        if (msg.toString().trim()==='quit') {
            await soWrite(conn, Buffer.from('Bye.\n'))
            console.log('Client disconnected...')
            socket.destroy()
            return
        } else {
            const reply = Buffer.concat([Buffer.from("Echo: "), msg])
            await soWrite(conn, reply)
        }
        // loop for messages
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