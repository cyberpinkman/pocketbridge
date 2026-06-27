const state = {
  pairing: null,
  socket: null,
  sourceDevice: navigator.userAgent.includes("iPhone") ? "PocketBridge iPhone" : "PocketBridge Phone"
};

const els = {
  status: document.querySelector("#status"),
  deviceName: document.querySelector("#deviceName"),
  textForm: document.querySelector("#textForm"),
  textTitle: document.querySelector("#textTitle"),
  textBody: document.querySelector("#textBody"),
  fileForm: document.querySelector("#fileForm"),
  fileInput: document.querySelector("#fileInput"),
  items: document.querySelector("#items"),
  refresh: document.querySelector("#refresh")
};

function headers(json = true) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-PocketBridge-Pair-Code": state.pairing.pairCode
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${state.pairing.serverBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      "X-PocketBridge-Pair-Code": state.pairing.pairCode
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(payload.error?.message ?? response.statusText);
  }

  return response.json();
}

function setStatus(text) {
  els.status.textContent = text;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Action failed";
}

function setBusy(target, busy) {
  if (!target) return;
  const controls = target.matches?.("form") ? target.querySelectorAll("button, input, textarea") : [target];
  for (const control of controls) {
    control.disabled = busy;
  }
}

async function runAction(label, target, action) {
  setBusy(target, true);
  setStatus(`${label}...`);
  try {
    const result = await action();
    setStatus(`${label} complete`);
    return result;
  } catch (error) {
    setStatus(errorMessage(error));
    return undefined;
  } finally {
    setBusy(target, false);
  }
}

async function loadPairing() {
  const response = await fetch("/api/pairing");
  state.pairing = await response.json();
  els.deviceName.textContent = state.pairing.deviceName;
}

function connectSocket() {
  const url = `${state.pairing.wsUrl}?pairCode=${encodeURIComponent(state.pairing.pairCode)}&client=mobile`;
  state.socket = new WebSocket(url);
  state.socket.addEventListener("open", () => setStatus("Connected"));
  state.socket.addEventListener("close", () => {
    setStatus("Disconnected");
    window.setTimeout(connectSocket, 1500);
  });
  state.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (["item.created", "item.updated", "item.shared", "knowledge.saved"].includes(payload.type)) {
      void loadSharedItems();
    }
  });
}

function renderItems(items) {
  if (items.length === 0) {
    els.items.innerHTML = `<p class="meta">No shared files yet</p>`;
    return;
  }

  els.items.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "item";
    row.innerHTML = `
      <div>
        <h3></h3>
        <p class="meta"></p>
      </div>
      <div class="actions">
        ${item.downloadUrl ? `<button data-action="download">Download</button>` : ""}
      </div>
    `;
    row.querySelector("h3").textContent = item.title;
    row.querySelector(".meta").textContent = `${item.kind} / ${item.origin} / ${new Date(item.createdAt).toLocaleString()}`;
    row.querySelector('[data-action="download"]')?.addEventListener("click", (event) => downloadItem(item, event.currentTarget));
    els.items.append(row);
  }
}

async function loadSharedItems() {
  const payload = await api("/api/items?sharedToMobile=true");
  renderItems(payload.items);
}

async function downloadItem(item, target) {
  await runAction("Download", target, async () => {
    const response = await fetch(`${state.pairing.serverBaseUrl}${item.downloadUrl}`, {
      headers: headers(false)
    });
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.originalFilename || item.title;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

els.refresh.addEventListener("click", () => runAction("Refresh", els.refresh, loadSharedItems));

els.textForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction("Upload text", els.textForm, async () => {
    await api("/api/items/text", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        title: els.textTitle.value || "Phone note",
        text: els.textBody.value,
        origin: "mobile",
        sourceDevice: state.sourceDevice,
        tags: ["mobile"]
      })
    });
    els.textForm.reset();
  });
});

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = els.fileInput.files[0];
  if (!file) return;

  await runAction("Upload file", els.fileForm, async () => {
    const form = new FormData();
    form.append("file", file);
    form.append("origin", "mobile");
    form.append("sourceDevice", state.sourceDevice);

    const response = await fetch(`${state.pairing.serverBaseUrl}/api/items/upload`, {
      method: "POST",
      headers: headers(false),
      body: form
    });

    if (!response.ok) throw new Error("Upload failed");
    els.fileForm.reset();
  });
});

try {
  await loadPairing();
  connectSocket();
  await loadSharedItems();
} catch (error) {
  setStatus(error instanceof Error ? error.message : "Failed");
}
