// An in-process SMTP fixture. It accepts mail locally; nothing leaves the test machine.
import { createServer } from "node:net";
export async function smtpFixture() {
  const messages = [],
    sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 local-test SMTP ready\r\n");
    let buffer = "",
      data = false,
      lines = [];
    socket.on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(lines.join("\n"));
            lines = [];
            data = false;
            socket.write("250 Message accepted\r\n");
          } else lines.push(line.replace(/^\.\./, "."));
        } else if (/^(EHLO|HELO)/i.test(line))
          socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH /i.test(line)) socket.write("235 Authenticated\r\n");
        else if (/^DATA$/i.test(line)) {
          data = true;
          socket.write("354 End with a dot\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    messages,
    port: server.address().port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
