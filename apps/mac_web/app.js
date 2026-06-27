const state = {
  pairing: null,
  socket: null
};

const els = {
  status: document.querySelector("#status"),
  deviceName: document.querySelector("#deviceName"),
  serverUrl: document.querySelector("#serverUrl"),
  pairCode: document.querySelector("#pairCode"),
  items: document.querySelector("#items"),
  refresh: document.querySelector("#refresh"),
  textForm: document.querySelector("#textForm"),
  textTitle: document.querySelector("#textTitle"),
  textBody: document.querySelector("#textBody"),
  fileForm: document.querySelector("#fileForm"),
  fileInput: document.querySelector("#fileInput"),
  shareImmediately: document.querySelector("#shareImmediately"),
  bleStatus: document.querySelector("#bleStatus"),
  pairingPayload: document.querySelector("#pairingPayload")
};

function apiHeaders(json = true) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-PocketBridge-Pair-Code": state.pairing.pairCode
  };
}

async function httpError(response, fallback = "Request failed") {
  const payload = await response.json().catch(() => ({ error: { message: response.statusText } }));
  return new Error(payload.error?.message || response.statusText || fallback);
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
    throw await httpError(response);
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
  if (!response.ok) {
    throw await httpError(response, "Pairing failed");
  }
  state.pairing = await response.json();
  els.deviceName.textContent = state.pairing.deviceName;
  els.serverUrl.textContent = state.pairing.serverBaseUrl;
  els.pairCode.textContent = `Pair code ${state.pairing.pairCode}`;
  els.pairingPayload.textContent = JSON.stringify(state.pairing, null, 2);
}

function connectSocket() {
  const url = `${state.pairing.wsUrl}?pairCode=${encodeURIComponent(state.pairing.pairCode)}&client=mac`;
  const socket = new WebSocket(url);
  state.socket = socket;

  socket.addEventListener("open", () => setStatus("Connected"));
  socket.addEventListener("close", () => {
    if (state.socket !== socket) return;
    setStatus("Disconnected");
    window.setTimeout(connectSocket, 1500);
  });
  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === "ble.status") {
      renderBle(payload.data);
    }
    if (["item.created", "item.updated", "item.shared", "knowledge.saved"].includes(payload.type)) {
      void loadItems();
    }
  });
}

function renderBle(status) {
  els.bleStatus.className = `ble ${status.status}`;
  els.bleStatus.textContent = `PocketKey ${status.status}`;
}

function itemSummary(item) {
  const chunks = [item.kind, item.origin, item.sourceDevice, new Date(item.createdAt).toLocaleString()];
  if (item.sharedToMobile) chunks.push("shared");
  if (item.status === "saved_to_knowledge") chunks.push("knowledge");
  return chunks.join(" / ");
}

function renderItems(items) {
  if (items.length === 0) {
    els.items.innerHTML = `<p class="meta">Inbox empty</p>`;
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
        <p></p>
      </div>
      <div class="actions">
        <button data-action="share">Share</button>
        <button data-action="knowledge">Save</button>
        ${item.downloadUrl ? `<button data-action="download">Download</button>` : ""}
      </div>
    `;

    row.querySelector("h3").textContent = item.title;
    row.querySelector(".meta").textContent = itemSummary(item);
    row.querySelector("p:not(.meta)").textContent = item.text || item.originalFilename || item.storageRelPath || "";
    row.querySelector('[data-action="share"]').addEventListener("click", (event) => shareItem(item.id, event.currentTarget));
    row.querySelector('[data-action="knowledge"]').addEventListener("click", (event) =>
      saveKnowledge(item.id, event.currentTarget)
    );
    row.querySelector('[data-action="download"]')?.addEventListener("click", (event) => downloadItem(item, event.currentTarget));
    els.items.append(row);
  }
}

async function loadItems() {
  const payload = await api("/api/items");
  renderItems(payload.items);
}

async function loadBle() {
  const status = await api("/api/ble/status");
  renderBle(status);
}

async function shareItem(id, target) {
  await runAction("Share", target, async () => {
    await api(`/api/items/${id}/share-to-mobile`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ sharedToMobile: true })
    });
    await loadItems();
  });
}

async function saveKnowledge(id, target) {
  await runAction("Save", target, async () => {
    await api(`/api/knowledge/${id}`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ tags: ["pocketbridge", "demo"], note: "Saved from PocketInbox." })
    });
    await loadItems();
  });
}

async function downloadItem(item, target) {
  await runAction("Download", target, async () => {
    const response = await fetch(`${state.pairing.serverBaseUrl}${item.downloadUrl}`, {
      headers: apiHeaders(false)
    });
    if (!response.ok) throw await httpError(response, "Download failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = item.originalFilename || item.title;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

els.refresh.addEventListener("click", () => runAction("Refresh", els.refresh, loadItems));

els.textForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction("Add text", els.textForm, async () => {
    await api("/api/items/text", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        title: els.textTitle.value || "Mac note",
        text: els.textBody.value,
        origin: "mac",
        sourceDevice: state.pairing.deviceName,
        tags: ["mac"]
      })
    });
    els.textForm.reset();
    await loadItems();
  });
});

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = els.fileInput.files[0];
  if (!file) return;

  await runAction("Upload file", els.fileForm, async () => {
    const form = new FormData();
    form.append("file", file);
    form.append("origin", "mac");
    form.append("sourceDevice", state.pairing.deviceName);
    form.append("sharedToMobile", String(els.shareImmediately.checked));

    const response = await fetch(`${state.pairing.serverBaseUrl}/api/items/upload`, {
      method: "POST",
      headers: apiHeaders(false),
      body: form
    });

    if (!response.ok) throw await httpError(response, "Upload failed");
    els.fileForm.reset();
    els.shareImmediately.checked = true;
    await loadItems();
  });
});

for (const button of document.querySelectorAll("[data-ble]")) {
  button.addEventListener("click", async () => {
    const status = button.getAttribute("data-ble");
    await runAction("BLE status", button, async () => {
      await api("/api/ble/status", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ status, deviceName: "PocketBridge Phone" })
      });
    });
  });
}

try {
  await loadPairing();
  connectSocket();
  await Promise.all([loadItems(), loadBle()]);
} catch (error) {
  setStatus(error instanceof Error ? error.message : "Failed");
}
