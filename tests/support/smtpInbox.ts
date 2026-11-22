import { createServer } from "node:net";

export async function startSmtpInbox() {
  const messages: { recipient: string; content: string }[] = [];
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let recipient = "";
    let lines: string[] | undefined;
    socket.write("220 localhost ready\r\n");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let end = buffer.indexOf("\r\n");
      while (end !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (lines) {
          if (line === ".") {
            messages.push({ recipient, content: lines.join("\n") });
            lines = undefined;
            socket.write("250 Message accepted\r\n");
          } else {
            lines.push(line);
          }
        } else if (line.startsWith("RCPT TO:")) {
          recipient = line.slice("RCPT TO:".length);
          socket.write("250 Recipient accepted\r\n");
        } else if (line === "DATA") {
          lines = [];
          socket.write("354 Enter message ending with a dot\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Goodbye\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
        end = buffer.indexOf("\r\n");
      }
    });
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate the SMTP test port.");
  const stop = () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return { messages, port: address.port, stop };
}
