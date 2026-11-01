// usage: node cdp.mjs <port> <out.png|-> [js-to-eval] [width height]
const [port, out, js, w, h] = process.argv.slice(2);
const list = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = list.find((t) => t.type === "page" && t.url.includes("5173"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
if (w)
  await send("Emulation.setDeviceMetricsOverride", {
    width: +w,
    height: +h,
    deviceScaleFactor: 1,
    mobile: false,
  });
if (js) {
  const r = await send("Runtime.evaluate", {
    expression: js,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(
    JSON.stringify(
      r.result?.result?.value ?? r.result?.exceptionDetails?.text ?? r
    )
  );
}
if (out !== "-") {
  await new Promise((r) => setTimeout(r, 1500));
  const s = await send("Page.captureScreenshot", { format: "png" });
  (await import("node:fs")).writeFileSync(
    out,
    Buffer.from(s.result.data, "base64")
  );
  console.log("saved", out);
}
ws.close();
