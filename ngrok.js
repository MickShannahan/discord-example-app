import 'dotenv/config';
import ngrok from '@ngrok/ngrok'
import http from 'http'

let running = false

export function runNgrok() {
  if (running) return
  // Create webserver
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('Congrats you have created an ngrok web server');
  }).listen(3001, () => console.log('Node.js web server at 3001 is running...'));

  // Get your endpoint online
  ngrok.connect({ addr: 3000, authtoken_from_env: true, authtoken: process.env.NGROK_AUTHTOKEN })
    .then(listener => console.log(`Ingress established at: ${listener.url()}`));
}

runNgrok()

