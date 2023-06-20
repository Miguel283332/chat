// config
var port = 80;

// cargar e inicializar los módulos
const fs = require('fs');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

server.listen(port, function () {
    console.log('Servidor epsile escuchando en el puerto %d', port);
});

app.use(express.static(__dirname + '/'));

// variables globales, mantiene el estado de la aplicación
var sockets = {};
var users = {};
var strangerQueue = false;
var peopleActive = 0;
var peopleTotal = 0;
const bannedIPs = fs.readFileSync('banned-ips.txt', 'utf8').split('\n').map(ip => ip.trim());


function fillZero(val) {
    if (val > 9) return "" + val;
    return "0" + val;
}

function timestamp() {
    var now = new Date();
    return "[" + fillZero(now.getHours()) + ":" + fillZero(now.getMinutes()) + ":" + fillZero(now.getSeconds()) + "]";
}

// escuchar las conexiones
io.on('connection', function (socket) {

    // almacenar el socket y la información del usuario
    sockets[socket.id] = socket;
    users[socket.id] = {
        connectedTo: -1,
        isTyping: false
    };

    // Obtener la IP del usuario conectado
    var ip = socket.handshake.address;
    console.log('Usuario conectado. IP:', ip);
    fs.readFile('banned-ips.txt', 'utf8', (err, data) => {
        if (err) {
          console.error('Error al leer el archivo:', err);
          return;
        }
      
        // Buscar la variable en el contenido del archivo
        if (data.includes(ip)) {
          console.log('La variable', ip , 'se encuentra en el archivo.');
        } 
        else {
          console.log('La variable', ip , 'no se encuentra en el archivo.');
        }
      });

    // conectar al usuario con otro si strangerQueue no está vacío
    if (strangerQueue !== false) {
        users[socket.id].connectedTo = strangerQueue;
        users[socket.id].isTyping = false;
        users[strangerQueue].connectedTo = socket.id;
        users[strangerQueue].isTyping = false;
        socket.emit('conn');
        sockets[strangerQueue].emit('conn');
        strangerQueue = false;

    } else {
        strangerQueue = socket.id;
    }

    peopleActive++;
    peopleTotal++;
    console.log(timestamp(), peopleTotal, "conectado");
    io.sockets.emit('stats', { people: peopleActive });

    socket.on("new", function () {

        // recibir datos de alguien
        if (strangerQueue !== false) {
            users[socket.id].connectedTo = strangerQueue;
            users[strangerQueue].connectedTo = socket.id;
            users[socket.id].isTyping = false;
            users[strangerQueue].isTyping = false;
            socket.emit('conn');
            sockets[strangerQueue].emit('conn');
            strangerQueue = false;

            // Obtener la IP de la persona actual
            var ip1 = socket.handshake.address;

            // Obtener la IP de la persona con la que se conectó
            var connectedSocket = sockets[strangerQueue];
            var ip2 = connectedSocket ? connectedSocket.handshake.address : 'Desconocida';

            // Imprimir mensaje en la terminal
            console.log('Nuevo chat iniciado entre', ip1, 'y', ip2);
        } else {
            strangerQueue = socket.id;
        }
        peopleActive++;
        io.sockets.emit('stats', { people: peopleActive });
    });

    // conversación finalizada
    socket.on("disconn", function () {
        var connTo = users[socket.id].connectedTo;
        if (strangerQueue === socket.id || strangerQueue === connTo) {
            strangerQueue = false;
        }
        users[socket.id].connectedTo = -1;
        users[socket.id].isTyping = false;
        if (sockets[connTo]) {
            users[connTo].connectedTo = -1;
            users[connTo].isTyping = false;
            sockets[connTo].emit("disconn", { who: 2 });
        }
        socket.emit("disconn", { who: 1 });
        peopleActive -= 2;
        io.sockets.emit('stats', { people: peopleActive });
    });

    socket.on('chat', function (message) {
        if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo]) {
            sockets[users[socket.id].connectedTo].emit('chat', message);

            // Obtener la IP del usuario que envía el mensaje
            var ip = socket.handshake.address;

            // Imprimir mensaje y la IP en la terminal
            console.log('Mensaje recibido de', ip + ':', message);
        }
    });

    socket.on('typing', function (isTyping) {
        if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo] && users[socket.id].isTyping !== isTyping) {
            users[socket.id].isTyping = isTyping;
            sockets[users[socket.id].connectedTo].emit('typing', isTyping);
        }
    });

    socket.on("disconnect", function (err) {

        // alguien se desconectó, canceló la conexión o fue expulsado
        var connTo = (users[socket.id] && users[socket.id].connectedTo);
        if (connTo === undefined) {
            connTo = -1;
        }
        if (connTo !== -1 && sockets[connTo]) {
            sockets[connTo].emit("disconn", { who: 2, reason: err && err.toString() });
            users[connTo].connectedTo = -1;
            users[connTo].isTyping = false;
            peopleActive -= 2;
        }

        delete sockets[socket.id];
        delete users[socket.id];

        if (strangerQueue === socket.id || strangerQueue === connTo) {
            strangerQueue = false;
            peopleActive--;
        }
        peopleTotal--;
        console.log(timestamp(), peopleTotal, "desconectado");
        io.sockets.emit('stats', { people: peopleActive });

    });

    // Manejar comandos en la terminal
    process.stdin.on('data', function (data) {
        var input = data.toString().trim();
    
        if (input === '/clear') {
            // Borrar la terminal
            console.clear();
        }
        else if (input.startsWith('/add')){
            if (input.length === 0) {
                alert('Por favor, ingrese un valor válido.');
                return;
              }
            const partes = input.split(' ');
            if (partes.length !== 2 || (partes[0] !== '/add' && partes[0] !== '/remove')) {
                alert('Por favor, ingrese un valor válido en el formato "/add [número]" o "/remove [número]".');
                return;
            }
            const operacion = partes[0];
            var numero = parseInt(partes[1]);
            numero = numero / 2;
            if (isNaN(numero)) {
                alert('Por favor, ingrese un número válido.');
                return;
              }
            if (operacion === '/add') {
                peopleActive += numero; // Suma el número a la variable
                peopleTotal += numero;
                console.log(timestamp(), peopleTotal, "conectado");
            } 
            else if (operacion === '/remove') {
                peopleActive -= numero; // Suma el número a la variable
                peopleTotal -= numero;
                console.log(timestamp(), peopleTotal, "conectado");
            }
        }
        else if (input.startsWith('/remove')){
            if (input.length === 0) {
                alert('Por favor, ingrese un valor válido.');
                return;
              }
            const partes = input.split(' ');
            if (partes.length !== 2 || (partes[0] !== '/add' && partes[0] !== '/remove')) {
                alert('Por favor, ingrese un valor válido en el formato "/add [número]" o "/remove [número]".');
                return;
            }
            const operacion = partes[0];
            var numero = parseInt(partes[1]);
            numero = numero / 2;
            if (isNaN(numero)) {
                alert('Por favor, ingrese un número válido.');
                return;
              }
            if (operacion === '/add') {
                peopleActive += numero; // Suma el número a la variable
                peopleTotal += numero;
                console.log(timestamp(), peopleTotal, "conectado");
            } 
            else if (operacion === '/remove') {
                peopleActive -= numero; // Suma el número a la variable
                peopleTotal -= numero;
                console.log(timestamp(), peopleTotal, "conectado");
            }
        }
        else if (input.startsWith('/ban')){
            var bannedip = input.replace('/ban', '');
            fs.appendFileSync('banned-ips.txt', bannedip + '\n');  //escribir nueva ip
            console.log(timestamp(),bannedip + " has been banned!");
            const bannedIPs = fs.readFileSync('banned-ips.txt', 'utf8').split('\n').map(ip => ip.trim());
            console.log("Banned-ips database updated!")
            console.log(1)
        }
        else if (input === '/info'){
            console.log("/exit, /clear, /add + num, /remove + num")
        }
        else if (input === '/help'){
            console.log("/exit, /clear, /add + num, /remove + num")
        }
        else if (input === '/exit') {
            // Cerrar el servidor y salir del proceso
            server.close();
            process.exit();
        }
    });
});
