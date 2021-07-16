const { Client , MessageMedia} = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIo = require('socket.io');
const http = require('http');
const qrcode = require('qrcode');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const ejs = require("ejs");
const fs = require('fs');
// const client = new Client();
const PORT = process.env.port|| '8000';

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));

app.get('/', (req, res) => {
	res.sendFile('multi.html', {
    root: __dirname
  });
})

app.get('/register', (req, res) => {
  res.sendFile('register.html', {
    root: __dirname
  });
})


const sessions = [];
const visited = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

const createSessionsFileIfNotExists = function() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log('Sessions file created successfully.');
    } catch(err) {
      console.log('Failed to create sessions file: ', err);
    }
  }
}

createSessionsFileIfNotExists();

const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

const getSessionsFile = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}



const createSession = function(id, description) {
  console.log('Creating session: ' + id);
  const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
  }

  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
        ],
      },
      session: sessionCfg
    });

  client.initialize();

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit('qr', { id: id, src: url });
      io.emit('message', { id: id, text: 'QR Code received, scan please!' });
    });
  });

  client.on('message', async msg => {
    console.log('MESSAGE RECEIVED', msg);
    if (msg.body === 'p') {
        // Send a new message as a reply to the current one
        msg.reply('pong');

    } else if (msg.body === '!ping') {
        // Send a new message to the same chat
        client.sendMessage(msg.from, 'pong');
    }else if (msg.body === '!chats') {
        const chats = await client.getChats();
        client.sendMessage(msg.from, `The bot has ${chats.length} chats open.`);
    }
});

client.on('ready', () => {
  io.emit('ready', { id: id });
  io.emit('message', { id: id, text: 'Whatsapp is ready!' });

  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
  savedSessions[sessionIndex].ready = true;
  setSessionsFile(savedSessions);
});

client.on('authenticated', (session) => {
  io.emit('authenticated', { id: id });
  io.emit('message', { id: id, text: 'Whatsapp is authenticated!' });
  sessionCfg = session;
  fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
    if (err) {
      console.error(err);
    }
  });
});

client.on('auth_failure', function(session) {
  io.emit('message', { id: id, text: 'Auth failure, restarting...' });
});

client.on('disconnected', (reason) => {
  io.emit('message', { id: id, text: 'Whatsapp is disconnected!' });
  fs.unlinkSync(SESSION_FILE_PATH, function(err) {
    if(err) return console.log(err);
    console.log('Session file deleted!');
  });
  client.destroy();
  client.initialize();

    // Menghapus pada file sessions
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit('remove-session', id);
  });

  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
}

const init = function(socket) {
  const savedSessions = getSessionsFile();

  if (savedSessions.length > 0) {
    if (socket) {
      socket.emit('init', savedSessions);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.description);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {
  init(socket);

  socket.on('create-session', function(data) {
    console.log('Create session: ' + data.id);
    createSession(data.id, data.description);
  });

});

app.post('/login', async(req, res) => {
   const sender = "idr5";
  // const hp = parseInt();
  const number = phoneNumberFormatter(req.body.wa);
  const message = "otp 6575";
  console.log(number)

  const client = sessions.find(sess => sess.id == sender).client;

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
})

// // Send message
app.post('/otp', async (req, res) => {
  // console.log('send-message');
  const sender = req.body.sender;
  // const hp = parseInt();
  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;
  console.log(number)

  const client = sessions.find(sess => sess.id == sender).client;

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

app.get('/get-qrcode', async(req, res) =>{
  const sender = req.body.id;
  const client = sessions.find(sess => sess.id == sender).client;
 client.on('qr', (qr) => {

   console.log('QR RECEIVED', qr);
   res.status(200).json({qr : qr, id:sender})
    // qrcode.toDataURL(qr, (err, url) => {
    //   io.emit('qr', { id: id, src: url });
    //   io.emit('message', { id: id, text: 'QR Code received, scan please!' });
    // });
  });
})

app.post('/insert-qrcode', (req, res) => {
  const id = req.body.id;
  const description = req.body.description;
  console.log('Creating session: ' + id);
  const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
  let sessionCfg;
  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
  }

  const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
        ],
      },
      session: sessionCfg
    });
  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client
  });

  // client.on('qr', (qr) => {

  //  console.log('QR RECEIVED', qr);
  //  res.status(200).json({qr : qr, id:id})
  //   // qrcode.toDataURL(qr, (err, url) => {
  //   //   io.emit('qr', { id: id, src: url });
  //   //   io.emit('message', { id: id, text: 'QR Code received, scan please!' });
  //   // });
  // });

  client.on('ready', () => {
    io.emit('ready', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is ready!' });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
  res.status(200).json({id : id, description:description});

});

// Send media
app.post('/sendmedia', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  // const fileUrl = req.body.file;
  const sender = req.body.sender;
  // const hp = parseInt();
  console.log(caption)

  const client = sessions.find(sess => sess.id == sender).client;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  const file = req.files.file;
  const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  // let mimetype;
  // const attachment = await axios.get(fileUrl, {
  //   responseType: 'arraybuffer'
  // }).then(response => {
  //   mimetype = response.headers['content-type'];
  //   return response.data.toString('base64');
  // });

  // const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});


// const SESSION_FILE_PATH = './whatsapp-session.json';
// let sessionCfg;
// if (fs.existsSync(SESSION_FILE_PATH)) {
//     sessionCfg = require(SESSION_FILE_PATH);
// }

// const client = new Client({
//   restartOnAuthFail: true,
//   puppeteer: {
//     headless: true,
//     args: [
//       '--no-sandbox',
//       '--disable-setuid-sandbox',
//       '--disable-dev-shm-usage',
//       '--disable-accelerated-2d-canvas',
//       '--no-first-run',
//       '--no-zygote',
//       '--single-process', // <- this one doesn't works in Windows
//       '--disable-gpu'
//     ],
//   },
//   session: sessionCfg
// });


// client.on('message', async msg => {
//     console.log('MESSAGE RECEIVED', msg);
//     if (msg.body === 'p') {
//         // Send a new message as a reply to the current one
//         msg.reply('pong');

//     } else if (msg.body === '!ping') {
//         // Send a new message to the same chat
//         client.sendMessage(msg.from, 'pong');
//     }
// });

// client.initialize();

// io.on('connection', function(socket) {
// socket.emit('message', 'Connecting...');

// client.on('qr', (qr) => {
//     console.log('QR RECEIVED', qr);
//     qrcode.toDataURL(qr, (err, url) => {
//       socket.emit('qr', url);
//       socket.emit('message', 'QR Code received, scan please!');
//     });
//   });

// client.on('ready', () => {
//     socket.emit('ready', 'Whatsapp is ready!');
//     socket.emit('message', 'Whatsapp is ready!');
//   });
// client.on('authenticated', (session) => {
//     socket.emit('authenticated', 'Whatsapp is authenticated!');
//     socket.emit('message', 'Whatsapp is authenticated!');
//     console.log('AUTHENTICATED', session);
//     sessionCfg = session;
//     fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
//       if (err) {
//         console.error(err);
//       }
//     });
//   });

//   client.on('auth_failure', function(session) {
//     socket.emit('message', 'Auth failure, restarting...');
//   });

//   client.on('disconnected', (reason) => {
//     socket.emit('message', 'Whatsapp is disconnected!');
//     fs.unlinkSync(SESSION_FILE_PATH, function(err) {
//         if(err) return console.log(err);
//         console.log('Session file deleted!');
//     });
//     client.destroy();
//     client.initialize();
//   });

// });

// const checkRegisteredNumber = async function(number) {
//   const isRegistered = await client.isRegisteredUser(number);
//   return isRegistered;
// }

server.listen(PORT, function(){
	console.log('app run' + PORT)
})
