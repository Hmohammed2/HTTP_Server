# Node.js TCP and HTTP Servers

## Introduction
This project contains three different server implementations in Node.js:
- A **simple TCP server** (`SimpleTCPserver.js`)
- An **asynchronous TCP echo server** (`TCPserverAsync.js`)
- An **HTTP server** (`HTTPServer.js`)

These servers demonstrate basic networking concepts using the `net` module in Node.js.

## Table of Contents
- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [Dependencies](#dependencies)
- [License](#license)

## Installation
1. Install [Node.js](https://nodejs.org/) if you haven't already.
2. Clone this repository or download the files.
3. Navigate to the project directory.

## Usage

### Running the Simple TCP Server
Run the following command:
```sh
node SimpleTCPserver.js
```
- The server listens on `localhost:5555`.
- It echoes back any data received.

### Running the Asynchronous TCP Echo Server
Run the following command:
```sh
node TCPserverAsync.js
```
- The server listens on `localhost:5556`.
- It echoes back messages prefixed with `Echo: `.
- If the message `quit` is received, the server responds with `Bye.` and disconnects the client.

### Running the HTTP Server
Run the following command:
```sh
node HTTPServer.js
```
- The server listens on `localhost:5556`.
- Supported endpoints:
  - `GET /echo` - Echoes back the request body.
  - Any other request returns `Hello World.`

## Features
- **`SimpleTCPserver.js`**: A basic TCP server that echoes incoming messages.
- **`TCPserverAsync.js`**: An improved version that handles messages asynchronously.
- **`HTTPServer.js`**: A minimal HTTP server with request parsing.

## Dependencies
- Uses only the built-in Node.js `net` module.
- No external dependencies required.

## License
This project is licensed under the MIT License.
