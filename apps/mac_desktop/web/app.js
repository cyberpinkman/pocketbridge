const state = {
  items: [],
  shares: [],
  selectedId: null,
  trust: null,
  events: [],
  currentPairCode: null,
  eventSocket: null,
  captureBaseImage: null,
  bleStatus: null,
  lastBleTransfer: null,
  lastCaptureItem: null
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
  screenCapture: document.querySelector("#screenCapture"),
  captureStudio: document.querySelector("#captureStudio"),
  captureCanvas: document.querySelector("#captureCanvas"),
  saveCapture: document.querySelector("#saveCapture"),
  clearCapture: document.querySelector("#clearCapture"),
  closeCapture: document.querySelector("#closeCapture"),
  itemList: document.querySelector("#itemList"),
  itemTotal: document.querySelector("#itemTotal"),
  updatedAt: document.querySelector("#updatedAt"),
  detailCard: document.querySelector("#detailCard"),
  sendPhone: document.querySelector("#sendPhone"),
  exportKnowledge: document.querySelector("#exportKnowledge"),
  demoBoundPhone: document.querySelector("#demoBoundPhone"),
  demoBluetoothTransfer: document.querySelector("#demoBluetoothTransfer"),
  demoRssi: document.querySelector("#demoRssi"),
  demoLockState: document.querySelector("#demoLockState"),
  demoLastCapture: document.querySelector("#demoLastCapture"),
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
elements.screenCapture.addEventListener("click", captureScreen);
elements.saveCapture.addEventListener("click", saveCapture);
elements.clearCapture.addEventListener("click", clearCaptureInk);
elements.closeCapture.addEventListener("click", closeCaptureStudio);
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
setupCaptureCanvas();
await refreshAll();
window.setInterval(() => {
  if (state.currentPairCode) {
    void loadBleStatus();
  }
}, 3000);

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
  renderDemoMode();
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
  state.bleStatus = data;
  state.trust = trustFromBleStatus(data);
  renderTrust();
  renderDemoMode();
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
  state.bleStatus = data;
  state.trust = trustFromBleStatus(data);
  renderTrust();
  renderDemoMode();
}

async function captureScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    logEvent("Screen capture is not available in this browser");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    drawVideoFrame(video);
    elements.captureStudio.hidden = false;
    logEvent("Screen captured; draw on the image to annotate");
  } catch (error) {
    logEvent(error instanceof Error ? error.message : "Screen capture cancelled");
  } finally {
    for (const track of stream?.getTracks?.() ?? []) {
      track.stop();
    }
  }
}

function drawVideoFrame(video) {
  const canvas = elements.captureCanvas;
  const context = canvas.getContext("2d");
  const width = video.videoWidth || canvas.width;
  const height = video.videoHeight || canvas.height;
  const scale = Math.min(960 / width, 540 / height, 1);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  state.captureBaseImage = context.getImageData(0, 0, canvas.width, canvas.height);
}

function setupCaptureCanvas() {
  const canvas = elements.captureCanvas;
  const context = canvas.getContext("2d");
  let drawing = false;

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) {
      return;
    }
    const point = canvasPoint(event);
    context.lineWidth = 6;
    context.lineCap = "round";
    context.strokeStyle = "#ff4d4f";
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  canvas.addEventListener("pointerup", () => {
    drawing = false;
  });
}

function canvasPoint(event) {
  const rect = elements.captureCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (elements.captureCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (elements.captureCanvas.height / rect.height)
  };
}

async function saveCapture() {
  const blob = await new Promise((resolve) => elements.captureCanvas.toBlob(resolve, "image/png"));
  if (!blob) {
    logEvent("Capture is empty");
    return;
  }

  const filename = `pocketbridge-capture-${Date.now()}.png`;
  const form = new FormData();
  form.set("origin", "mac");
  form.set("sourceDevice", "PocketBridge Capture");
  form.set("title", filename);
  form.set("tags", JSON.stringify(["capture", "annotation"]));
  form.set("file", blob, filename);
  const result = await api("/api/items/upload", { method: "POST", body: form });
  state.lastCaptureItem = result.item;
  logEvent(`Saved ${filename}`);
  elements.captureStudio.hidden = true;
  renderDemoMode();
  await loadItems();
}

function clearCaptureInk() {
  const canvas = elements.captureCanvas;
  const context = canvas.getContext("2d");
  if (state.captureBaseImage) {
    context.putImageData(state.captureBaseImage, 0, 0);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  logEvent("Capture cleared");
}

function closeCaptureStudio() {
  elements.captureStudio.hidden = true;
}

async function sendSelectedToPhone() {
  const selected = getSelected();
  if (!selected) {
    return;
  }

  const result = await api(`/api/ble/send/${selected.id}`, { method: "POST" });
  state.lastBleTransfer = result.transfer;
  logEvent(`Bluetooth ${result.transfer.status}: ${selected.title}`);
  renderDemoMode();
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
      state.bleStatus = {
        ...(state.bleStatus ?? {}),
        ...data
      };
      state.trust = trustFromBleStatus(data);
      renderTrust();
      renderDemoMode();
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

function renderDemoMode() {
  const ble = state.bleStatus;
  elements.demoBoundPhone.textContent = ble?.deviceName ?? (state.currentPairCode ? "Paired phone" : "Not paired");
  elements.demoBluetoothTransfer.textContent = state.lastBleTransfer
    ? `${state.lastBleTransfer.status} ${state.lastBleTransfer.itemId}`
    : "Idle";
  elements.demoRssi.textContent = typeof ble?.rssi === "number" ? `${ble.rssi} dBm` : "-- dBm";
  elements.demoLockState.textContent = ble?.lockState ?? (state.trust?.trusted ? "unlocked" : "locked");
  elements.demoLastCapture.textContent = state.lastCaptureItem?.title ?? "No capture saved";
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
