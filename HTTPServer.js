const { equal } = require("assert")
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
    const idx = buf.data.subarray(0, buf.length).indexOf("\n")
    if (idx < 0) {
        return null
    }
    // buf.subarray() returns reference of a subarray without copying. Buffer.from() creates a new buffer by copying the data from the source.
    const msg = Buffer.from(buf.data.subarray(0, idx + 1))
    bufPop(buf, idx + 1)
    return msg
}

/**
 * Removes data from the front of the buffer
 * @param {*} buf: Dynamic buffer
 * @param {*} len: Buffer length  
 */
function bufPop(buf, len) {
    // buf.copyWithin(dst, src_start, src_end) copies data within a buffer, source and destination can overlap, like memmove() in C.
    buf.data.copyWithin(0, len, buf.length)
    buf.length -= len;
}

/**
 * Function is for looking up the field value by name. Note that field names are case-insensitive
 * @param {*} headers: Buffer object
 * @param {*} key: String object
 * @returns Buffer object of the field name
 */
function fieldGet(headers, key) {
    // headers must be a Buffer and key is a string. Must return a Buffer object
    if (!Buffer.isBuffer(headers) || typeof key !== 'string') {
        throw new TypeError('Invalid arguments: headers must be a Buffer and key must be a string');
    }

    // convert buffer to string
    const headerString = headers.toString()
    const lines = headerString.split(/\r?\n/)

    // for case insensitivity comparison we convert key argument into lower case
    const lowerkey = key.toLowerCase()

    for (const line of lines) {
        const [field, ...valueParts] = line.split(":")
        if (field && valueParts.length > 0) {
            if (field.trim().toLowerCase === lowerkey) {
                return Buffer.from(valueParts.join(":").trim())
            }
        }
    }
    return null // return null if field is empty
}

/**
 * HTTP request body reader
 * @param {*} buf: Dynamic Buffer
 * @param {*} conn: TCP connection
 * @param {*} req: HTTP request
 */
function readerFromReq(conn, buf, req) {
    let bodyLen = -1;

    const contentLength = fieldGet(req.headers, 'Content-length')

    if (contentLength) {
        bodyLen = parseDec(contentLength.toString('latin1'))
        if (isNaN(bodyLen)) {
            throw new HTTPError(400, 'Bad Content length!')
        }
    }
    const bodyAllowed = !(req.headers === "GET" || req.headers === 'HEAD')
    // chunked transfer encoding, the data stream is divided into a series of non-overlapping "chunks". 
    // The chunks are sent out and received independently of one another. N
    const chunked = fieldGet(req.headers, 'Transfer-encoding')
        ?.equal(Buffer.from('chunked')) || false
    if (!bodyAllowed && (bodyLen > 0 || chunked)) {
        throw new HTTPError(400, 'HTTP body not allowed')
    }
    if (bodyAllowed > 0) {
        bodyLen = 0
    }

    if (bodyLen >= 0) {
        // Content-length is present
        return readerFromConnLength(conn, buf, bodyLen)
    } else if (chunked) {
        // chunked encoding
        throw new HTTPError(501, 'TODO')
    } else {
        // read the rest of the connection
        throw new HTTPError(501, 'TODO');
    }
}

/**
* Body reader from a socket with a known length. Implementation is based on whether Content-Length field is present
* The readerFromConnLength() function returns a BodyReader that reads exactly the number of bytes specified in the Content-Length field. Note that the data from the socket goes into the buffer first, then we drain data from the buffer. This is because:
* 1) There may be extra data in the buffer before we read from the socket.
* 2) The last read may return more data than we need, so we need to put the extra data back into the buffer.
* 3) The remain variable is a state captured by the soRead() function to keep track of the remaining body length.
* @param {*} buf: Dynamic Buffer
* @param {*} conn: TCP connection object
* @param {*} remain: Number 
 */
function readerFromConnLength(conn, buf, remain) {
    return {
        length: remain,
        read: async () => {
            if (remain === 0) {
                return Buffer.from('')
                // Done
            }
            if (buf.length === 0) {
                // try to get data if there isnt any
                const data = await soRead(conn)
                bufPush(buf, data)
                if (data.length === 0) {
                    // expect more data
                    throw new Error("Unexpected EOF from http body")
                }

            }
            // consume data from the buffer
            const consume = Math.min(buf.length, remain)
            remain -= consume
            const data = Buffer.from(buf.data.subarray(0, consume))
            bufPop(buf, consume)
            return data
        }
    }
}
/**
 * Request handler that returns a promise
 * @param {*} req: HTTPreq 
 * @param {*} body: BodyReader
 * @returns Promise object that is a http response object
 */
async function handleReq(req, body) {
    // act on the request URI
    let resp
    switch (req.uri.toString("latin1")) {
        case '/echo':
            // http echo server
            resp = body
            break;
        default:
        resp = readerFromMemory(Buffer.from('Hello World.\n'))
        break;
    }

    return {
        code: 200,
        headers: [Buffer.from('Server: My first http server!')] ,
        body: resp
    }

}
/**
 * BodyReader from in memory data
 * @param {*} data 
 * @returns 
 */
function readerFromMemory(data) {
    let done = false;
    return {
        length: data.length,
        // read function returns full data on first call and returns EOF after that. Useful for responding with something small and already fits in memory.
        read: async () => {
            if (done) {
                return Buffer.from(''); // no more data
            } else {
                done = true;
                return data;
            }
        },
    };
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
    const buf = { data: Buffer.alloc(0), length: 0 }
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
        const reqBody = readerFromReq(conn, buf, msg)
        const res = await handleReq(msg, reqBody)
        await writeHTTPResponse(conn, res)

        if (msg.version == 1.0) {
            return
        }

        while ((await reqBody.read()).length > 0) {}
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