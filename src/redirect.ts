import http from 'http';

export default function redirect(protocol: string, port: number | string) {
  const listener: http.RequestListener = (req, res) => {
    var url = new URL(`${protocol}://${req.headers.host || "localhost"}`);
    url.port = port.toString();
    res.writeHead(302, { location: url.toString() });
    res.end();
  }

  return listener;
}
