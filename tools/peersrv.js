// Local PeerServer for tools/online.js (binds to 127.0.0.1:9000). Needs `npm install peer@1` in /tmp/peersrv.
const http = require('http');
const { ExpressPeerServer } = require('/tmp/peersrv/node_modules/peer');
const express = require('/tmp/peersrv/node_modules/express');
const app = express();
const server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/' }));
server.listen(9000, '127.0.0.1', () => console.log('peer server on 127.0.0.1:9000'));
