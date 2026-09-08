const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          .fade-in { animation: fadeIn 2s forwards; opacity: 0; }
          @keyframes fadeIn { to { opacity: 1; } }
          .lazy-box { margin-top: 1500px; height: 300px; background: orange; }
        </style>
      </head>
      <body>
        <h1 class="fade-in">Loaded Title</h1>
        <div style="height: 1200px; background: #eee;">Hero Content</div>
        <div id="lazy" class="lazy-box">Lazy Loaded Section</div>
        <script>
          setTimeout(() => {
            const extra = document.createElement('div');
            extra.style.height = '800px';
            extra.style.background = '#ccc';
            extra.innerText = 'Appended After Delay';
            document.body.appendChild(extra);
          }, 800);
        </script>
      </body>
    </html>
  `);
});

server.listen(4321);
console.log('Stress test server running on http://127.0.0.1:4321');