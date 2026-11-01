// usage: node main-eval.mjs <inspectPort> <js>  — evaluates in Electron's main process
const [port, js] = process.argv.slice(2);
const [target] = await (
  await fetch(`http://localhost:${port}/json/list`)
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id === 1) {
    console.log(
      JSON.stringify(
        d.result?.result?.value ??
          d.result?.exceptionDetails?.exception?.description ??
          d.result
      )
    );
    ws.close();
  }
};
ws.send(
  JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: js,
      awaitPromise: true,
      returnByValue: true,
      includeCommandLineAPI: true,
    },
  })
);
