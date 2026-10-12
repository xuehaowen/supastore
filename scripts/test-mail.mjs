import net from "node:net";
import http from "node:http";

// Minimal local-only SMTP sink for verification-link browser tests. Never relays mail.
const messages = [];
const smtp = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 localhost synthetic SMTP\r\n");
  let buffer = "",
    receiving = false,
    message = "";
  socket.on("error", () => socket.destroy());
  socket.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n");
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (receiving) {
        if (line === ".") {
          messages.push(
            message
              .replace(/=\r\n/g, "")
              .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
          );
          message = "";
          receiving = false;
          socket.write("250 Accepted\r\n");
        } else message += line.replace(/^\.\./, ".") + "\r\n";
      } else if (/^(EHLO|HELO)/i.test(line))
        socket.write("250-localhost\r\n250 8BITMIME\r\n");
      else if (/^DATA$/i.test(line)) {
        receiving = true;
        socket.write("354 End with dot\r\n");
      } else if (/^QUIT$/i.test(line)) {
        socket.end("221 Bye\r\n");
      } else socket.write("250 OK\r\n");
    }
  });
});
const api = http.createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(messages));
});
smtp.listen(25259, "127.0.0.1");
api.listen(9010, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    smtp.close();
    api.close(() => process.exit());
  });
