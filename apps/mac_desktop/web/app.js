const state = {
  items: [],
  shares: [],
  selectedId: null,
  trust: null,
  events: [],
  currentPairCode: null,
  eventSocket: null
};

const elements = {
  createPairing: document.querySelector("#createPairing"),
  qrFrame: document.querySelector("#qrFrame"),
  pairingToken: document.querySelector("#pairingToken"),
  pairingPayload: document.querySelector("#pairingPayload"),
  copyPairingPayload: document.querySelector("#copyPairingPayload"),
  trustCard: document.querySelector("#trustCard"),
  trustTitle: document.querySelector("#trustTitle"),
  trustReason: document.querySelector("#trustReason"),
  trustOn: document.querySelector("#trustOn"),
  trustOff: document.querySelector("#trustOff"),
  trustLocked: document.querySelector("#trustLocked"),
  inboxCount: document.querySelector("#inboxCount"),
  outboxCount: document.querySelector("#outboxCount"),
  searchInput: document.querySelector("#searchInput"),
  refreshItems: document.querySelector("#refreshItems"),
  quickText: document.querySelector("#quickText"),
  quickUpload: document.querySelector("#quickUpload"),
  fileInput: document.querySelector("#fileInput"),
  selectedFileName: document.querySelector("#selectedFileName"),
  fileUpload: document.querySelector("#fileUpload"),
  snapzyImport: document.querySelector("#snapzyImport"),
  itemList: document.querySelector("#itemList"),
  itemTotal: document.querySelector("#itemTotal"),
  updatedAt: document.querySelector("#updatedAt"),
  detailCard: document.querySelector("#detailCard"),
  sendPhone: document.querySelector("#sendPhone"),
  exportKnowledge: document.querySelector("#exportKnowledge"),
  shareList: document.querySelector("#shareList"),
  shareTotal: document.querySelector("#shareTotal"),
  eventLog: document.querySelector("#eventLog"),
  clearLog: document.querySelector("#clearLog")
};

elements.createPairing.addEventListener("click", () => createPairing());
elements.copyPairingPayload.addEventListener("click", copyPairingPayload);
elements.refreshItems.addEventListener("click", refreshAll);
elements.searchInput.addEventListener("input", renderItems);
elements.quickUpload.addEventListener("click", quickUpload);
elements.fileInput.addEventListener("change", updateSelectedFile);
elements.fileUpload.addEventListener("click", uploadSelectedFile);
elements.snapzyImport.addEventListener("click", importSnapzyFolder);
elements.trustOn.addEventListener("click", () => setBleDemoStatus("trusted"));
elements.trustOff.addEventListener("click", () => setBleDemoStatus("away"));
elements.trustLocked.addEventListener("click", () => setBleDemoStatus("locked"));
elements.sendPhone.addEventListener("click", sendSelectedToPhone);
elements.exportKnowledge.addEventListener("click", exportSelected);
elements.clearLog.addEventListener("click", () => {
  state.events = [];
  renderEvents();
});

await loadHealth();
await createPairing({ silent: true });
await refreshAll();

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (state.currentPairCode && path.startsWith("/api/") && !headers.has("X-PocketBridge-Pair-Code")) {
    headers.set("X-PocketBridge-Pair-Code", state.currentPairCode);
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${body}`);
  }
  return response.json();
}

async function loadHealth() {
  const data = await api("/health");
  state.trust = data.trust;
  renderTrust();
}

async function createPairing(options = {}) {
  const data = await api("/api/pairing");
  state.currentPairCode = data.pairCode;
  const qrUrl = `/api/pairing/qr.svg?pairCode=${encodeURIComponent(data.pairCode)}&t=${Date.now()}`;
  elements.qrFrame.innerHTML = `<img alt="PocketBridge pairing QR code" src="${qrUrl}">`;
  elements.pairingToken.textContent = `Pair code: ${data.pairCode}`;
  elements.pairingPayload.value = JSON.stringify(data, null, 2);
  elements.copyPairingPayload.disabled = false;
  connectEvents();
  await loadBleStatus();
  if (!options.silent) {
    logEvent(`Pairing QR created for ${data.serverBaseUrl}`);
  }
}

async function copyPairingPayload() {
  const payload = elements.pairingPayload.value.trim();
  if (!payload) {
    return;
  }

  await navigator.clipboard.writeText(payload);
  logEvent("Pairing payload copied");
}

async function loadBleStatus() {
  const data = await api("/api/ble/status");
  state.trust = trustFromBleStatus(data);
  renderTrust();
}

async function loadItems() {
  const data = await api("/api/items");
  state.items = data.items;
  if (!state.items.some((item) => item.id === state.selectedId)) {
    state.selectedId = state.items[0]?.id ?? null;
  }
  renderItems();
  renderDetail();
}

async function loadShares() {
  const data = await api("/api/items?sharedToMobile=true");
  state.shares = data.items;
  renderShares();
}

async function refreshAll() {
  await loadItems();
  await loadShares();
}

async function quickUpload() {
  const text = elements.quickText.value.trim();
  if (!text) {
    return;
  }

  await api("/api/items/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: titleFromText(text),
      text,
      origin: "mac",
      sourceDevice: "PocketBridge Mac",
      tags: ["mac"]
    })
  });
  elements.quickText.value = "";
  await loadItems();
}

function updateSelectedFile() {
  const file = elements.fileInput.files?.[0];
  elements.selectedFileName.textContent = file ? file.name : "Choose screenshot or document";
}

async function uploadSelectedFile() {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    logEvent("Choose a file before upload");
    return;
  }

  const form = new FormData();
  form.set("origin", "mac");
  form.set("sourceDevice", "PocketBridge Mac");
  form.set("title", file.name);
  form.set("tags", JSON.stringify(["mac"]));
  form.set("file", file);
  await api("/api/items/upload", { method: "POST", body: form });
  elements.fileInput.value = "";
  updateSelectedFile();
  logEvent(`Uploaded ${file.name}`);
  await loadItems();
}

async function importSnapzyFolder() {
  const result = await api("/snapzy/import", { method: "POST" });
  logEvent(`Imported ${result.items.length} Snapzy item${result.items.length === 1 ? "" : "s"}`);
  await loadItems();
}

async function setBleDemoStatus(status) {
  const rssiByStatus = {
    trusted: -49,
    away: -82,
    locked: -96
  };
  const data = await api("/api/ble/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status,
      deviceName: "Demo phone",
      rssi: rssiByStatus[status]
    })
  });
  state.trust = trustFromBleStatus(data);
  renderTrust();
}

async function sendSelectedToPhone() {
  const selected = getSelected();
  if (!selected) {
    return;
  }

  await api(`/api/items/${selected.id}/share-to-mobile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sharedToMobile: true })
  });
  logEvent(`Queued ${selected.title} for phone`);
  await refreshAll();
}

async function exportSelected() {
  const selected = getSelected();
  if (!selected) {
    return;
  }

  const result = await api(`/api/knowledge/${selected.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultDir: "./data/obsidian/PocketBridge" })
  });
  logEvent(`Exported to ${result.item.knowledgePath}`);
  await loadItems();
}

function connectEvents() {
  if (!state.currentPairCode) {
    return;
  }

  state.eventSocket?.close();
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(
    `${protocol}://${location.host}/ws?pairCode=${encodeURIComponent(state.currentPairCode)}&client=mac`
  );
  state.eventSocket = socket;

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    const data = message.data ?? {};
    if (message.type === "item.created") {
      logEvent(`Received ${data.item?.title ?? "item"}`);
      await loadItems();
    } else if (message.type === "item.updated") {
      logEvent(`Updated ${data.item?.title ?? "item"}`);
      await loadItems();
      await loadShares();
    } else if (message.type === "item.shared") {
      logEvent("Share queued for phone");
      await loadShares();
    } else if (message.type === "knowledge.saved") {
      logEvent("Saved to knowledge");
      await loadItems();
    } else if (message.type === "pairing.connected") {
      logEvent("Pairing channel connected");
    } else if (message.type === "ble.status") {
      state.trust = trustFromBleStatus(data);
      renderTrust();
      logEvent(state.trust.trusted ? "Phone trusted" : "Phone away");
    }
  });

  socket.addEventListener("close", () => {
    logEvent("Bridge event stream closed");
  });
}

function trustFromBleStatus(status) {
  const trusted = status.status === "trusted";
  const device = status.deviceName ?? "Phone";
  const suffix = typeof status.rssi === "number" ? ` RSSI ${status.rssi}` : "";
  return {
    trusted,
    reason: `${device} ${status.status ?? "unknown"}${suffix}`,
    updatedAt: status.updatedAt ?? new Date().toISOString()
  };
}

function renderTrust() {
  const trust = state.trust ?? { trusted: false, reason: "Unknown" };
  elements.trustCard.classList.toggle("trusted", trust.trusted);
  elements.trustTitle.textContent = trust.trusted ? "Trusted" : "Locked";
  elements.trustReason.textContent = trust.reason;
}

function renderShares() {
  elements.outboxCount.textContent = String(state.shares.length);
  elements.shareTotal.textContent = `${state.shares.length} shared item${state.shares.length === 1 ? "" : "s"}`;

  if (state.shares.length === 0) {
    elements.shareList.innerHTML = `<p class="muted compact-empty">No phone shares yet.</p>`;
    return;
  }

  elements.shareList.innerHTML = state.shares
    .slice(0, 5)
    .map((item) => {
      const detail = `${item.kind} from ${item.origin}${item.downloadUrl ? " · downloadable" : ""}`;
      return `
        <div class="share-row">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(detail)}</span>
          </div>
          <span class="status">${escapeHtml(item.status)}</span>
        </div>
      `;
    })
    .join("");
}

function renderItems() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const visibleItems = state.items.filter((item) =>
    [item.title, item.kind, item.origin, item.status].join(" ").toLowerCase().includes(query)
  );

  elements.inboxCount.textContent = String(state.items.length);
  elements.itemTotal.textContent = `${state.items.length} items total`;
  elements.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  elements.itemList.innerHTML = visibleItems
    .map((item) => {
      const selected = item.id === state.selectedId ? " selected" : "";
      return `
        <button class="item-row${selected}" data-item-id="${item.id}">
          <span class="cell-muted">${escapeHtml(item.origin)}</span>
          <span>${escapeHtml(item.kind)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <span class="cell-muted">${formatTime(item.createdAt)}</span>
          <span class="status">${escapeHtml(item.status)}</span>
        </button>
      `;
    })
    .join("");

  for (const row of elements.itemList.querySelectorAll(".item-row")) {
    row.addEventListener("click", () => {
      state.selectedId = row.dataset.itemId;
      renderItems();
      renderDetail();
    });
  }
}

function renderDetail() {
  const selected = getSelected();
  elements.sendPhone.disabled = !selected;
  elements.exportKnowledge.disabled = !selected;

  if (!selected) {
    elements.detailCard.innerHTML = `
      <h2>Select an item</h2>
      <p class="muted">Choose an inbox row to review details, send it to phone, or export it to the knowledge base.</p>
    `;
    return;
  }

  elements.detailCard.innerHTML = `
    <h2>${escapeHtml(selected.title)}</h2>
    <div class="detail-grid">
      ${detailRow("Kind", selected.kind)}
      ${detailRow("Origin", selected.origin)}
      ${detailRow("Device", selected.sourceDevice)}
      ${detailRow("Received", new Date(selected.createdAt).toLocaleString())}
      ${detailRow("Status", selected.status)}
      ${selected.originalFilename ? detailRow("File", selected.originalFilename) : ""}
      ${selected.mimeType ? detailRow("MIME", selected.mimeType) : ""}
      ${selected.text ? detailRow("Text", selected.text) : ""}
      ${selected.storageRelPath ? detailRow("Path", selected.storageRelPath) : ""}
      ${selected.downloadUrl ? detailRow("Download", selected.downloadUrl) : ""}
      ${selected.knowledgePath ? detailRow("Knowledge", selected.knowledgePath) : ""}
      ${detailRow("Item ID", selected.id)}
    </div>
  `;
}

function renderEvents() {
  elements.eventLog.innerHTML = state.events
    .slice(0, 8)
    .map(
      (entry) => `
        <div class="event">
          <span class="event-dot"></span>
          <span>${entry.time}</span>
          <strong>${escapeHtml(entry.text)}</strong>
        </div>
      `
    )
    .join("");
}

function logEvent(text) {
  state.events.unshift({
    text,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  });
  renderEvents();
}

function getSelected() {
  return state.items.find((item) => item.id === state.selectedId);
}

function detailRow(label, value) {
  return `
    <div class="detail-row">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(String(value))}</span>
    </div>
  `;
}

function titleFromText(text) {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
