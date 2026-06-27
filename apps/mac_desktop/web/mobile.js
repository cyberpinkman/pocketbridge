const state = {
  pairing: null,
  socket: null,
  sourceDevice: navigator.userAgent.includes("iPhone") ? "PocketBridge iPhone" : "PocketBridge Phone"
};

const elements = {
  status: document.querySelector("#status"),
  deviceName: document.querySelector("#deviceName"),
  pairCode: document.querySelector("#pairCode"),
  textForm: document.querySelector("#textForm"),
  textTitle: document.querySelector("#textTitle"),
  textBody: document.querySelector("#textBody"),
  fileForm: document.querySelector("#fileForm"),
  fileInput: document.querySelector("#fileInput"),
  items: document.querySelector("#items"),
  refresh: document.querySelector("#refresh")
};

elements.refresh.addEventListener("click", () => runAction("Refresh", elements.refresh, loadSharedItems));
elements.textForm.addEventListener("submit", uploadText);
elements.fileForm.addEventListener("submit", uploadFile);

function authHeaders(json = true) {
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

async function loadPairing() {
  const response = await fetch("/api/pairing");
  if (!response.ok) {
    throw new Error("Pairing unavailable");
  }

  state.pairing = await response.json();
  elements.deviceName.textContent = state.pairing.deviceName;
  elements.pairCode.textContent = `Pair code ${state.pairing.pairCode}`;
}

function connectSocket() {
  const url = `${state.pairing.wsUrl}?pairCode=${encodeURIComponent(state.pairing.pairCode)}&client=mobile`;
  state.socket = new WebSocket(url);
  state.socket.addEventListener("open", () => setStatus("Connected"));
  state.socket.addEventListener("close", () => {
    setStatus("Disconnected; reconnecting");
    window.setTimeout(connectSocket, 1500);
  });
  state.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (["item.created", "item.updated", "item.shared", "item.deleted", "knowledge.saved"].includes(payload.type)) {
      void loadSharedItems();
    }
  });
}

async function uploadText(event) {
  event.preventDefault();
  await runAction("Upload text", elements.textForm, async () => {
    await api("/api/items/text", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        title: elements.textTitle.value || "Phone note",
        text: elements.textBody.value,
        origin: "mobile",
        sourceDevice: state.sourceDevice,
        tags: ["mobile"]
      })
    });
    elements.textForm.reset();
  });
}

async function uploadFile(event) {
  event.preventDefault();
  const file = elements.fileInput.files[0];
  if (!file) {
    setStatus("Choose a file first");
    return;
  }

  await runAction("Upload file", elements.fileForm, async () => {
    const form = new FormData();
    form.append("file", file);
    form.append("origin", "mobile");
    form.append("sourceDevice", state.sourceDevice);
    form.append("title", file.name);

    const response = await fetch(`${state.pairing.serverBaseUrl}/api/items/upload`, {
      method: "POST",
      headers: authHeaders(false),
      body: form
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(payload.error?.message ?? "Upload failed");
    }
    elements.fileForm.reset();
  });
}

async function loadSharedItems() {
  const payload = await api("/api/items?sharedToMobile=true");
  renderItems(payload.items);
}

function renderItems(items) {
  if (items.length === 0) {
    elements.items.innerHTML = `<p class="muted">No shared files yet</p>`;
    return;
  }

  elements.items.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "mobile-item";
    row.innerHTML = `
      <div>
        <h2></h2>
        <p></p>
      </div>
      <button class="secondary-button" data-action="download">Download</button>
    `;
    row.querySelector("h2").textContent = item.title;
    row.querySelector("p").textContent = `${item.kind} / ${item.origin} / ${formatDate(item.createdAt)}`;
    const download = row.querySelector("[data-action='download']");
    download.disabled = !item.downloadUrl;
    download.addEventListener("click", () => downloadItem(item, download));
    elements.items.append(row);
  }
}

async function downloadItem(item, target) {
  await runAction("Download", target, async () => {
    const response = await fetch(`${state.pairing.serverBaseUrl}${item.downloadUrl}`, {
      headers: authHeaders(false)
    });
    if (!response.ok) {
      throw new Error("Download failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.originalFilename || item.title;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

async function runAction(label, target, action) {
  setBusy(target, true);
  setStatus(`${label}...`);
  try {
    const result = await action();
    setStatus(`${label} complete`);
    return result;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Action failed");
    return undefined;
  } finally {
    setBusy(target, false);
  }
}

function setBusy(target, busy) {
  if (!target) {
    return;
  }

  const controls = target.matches?.("form") ? target.querySelectorAll("button, input, textarea") : [target];
  for (const control of controls) {
    control.disabled = busy;
  }
}

function setStatus(text) {
  elements.status.textContent = text;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

try {
  await loadPairing();
  connectSocket();
  await loadSharedItems();
} catch (error) {
  setStatus(error instanceof Error ? error.message : "Failed to start");
}
