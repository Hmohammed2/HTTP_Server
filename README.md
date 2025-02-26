# Echo Server with Node.js and net Module



Echo Server is a simple TCP server built with Node.js that listens for client connections, reads incoming data, and echoes it back. It supports handling multiple concurrent connections and ensures asynchronous data processing.

---

## Features

- **Asynchronous Data Handling**: Uses Promises to manage socket communication.
- **Graceful Error Handling**: Properly detects and manages EOF and socket errors.
- **Echo Functionality**: Reads data from clients and sends it back.
- **Concurrent Connections**: Handles multiple clients at once.

---

## Prerequisites

- Install [Node.js](https://nodejs.org/) (v14 or later recommended)

---

## Installation

Clone the repository and navigate to the project directory:

```sh
git clone https://github.com/your-username/echo-server.git
cd echo-server
```

---

## Usage

Start the server:

```sh
node server.js
```

The server will start listening on `localhost:5556`.

To test, use `netcat`:

```sh
nc localhost 5556
```

Type a message and press enter; the server will echo it back.

---

## API Breakdown

### **Socket Initialization**

#### `soInit(socket)`

Wraps a `net.Socket` object, managing connection state and event listeners.

### **Reading from Socket**

#### `soRead(conn)`

Reads data asynchronously from the socket and returns it as a `Promise`.

### **Writing to Socket**

#### `soWrite(conn, data)`

Writes data to the socket and resolves once the write operation is complete.

### **Handling Connections**

#### `newConn(socket)`

Handles new incoming connections and calls `serveClient(socket)`.

#### `serveClient(socket)`

Implements the echo functionality, continuously reading and writing data until EOF.

### **Server Management**

#### `soListen()`

Creates and starts a TCP server that listens for incoming connections.

#### `soAccept(listener)`

Waits for a new client connection and resolves with the connected socket.

#### `main()`

Starts the server, listens for connections, and manages client interactions.

---

## Error Handling

- Ensures that socket errors and EOF are properly managed.
- Prevents hanging promises by rejecting on error conditions.

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

---

## License

This project is open-source and available under the [MIT License](LICENSE).

