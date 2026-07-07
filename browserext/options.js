// Opties-pagina: beheert het webhook secret in chrome.storage.local.

const input = document.getElementById('secret');
const status = document.getElementById('status');
const fields = {
  sent: document.getElementById('sent'),
  rejected: document.getElementById('rejected'),
  duplicates: document.getElementById('duplicates'),
  errors: document.getElementById('errors'),
  extensionVersion: document.getElementById('extensionVersion'),
  lastSyncAt: document.getElementById('lastSyncAt'),
  lastRejectedReason: document.getElementById('lastRejectedReason'),
  lastError: document.getElementById('lastError'),
};

// Bestaande waarde inladen.
chrome.storage.local.get('webhookSecret', ({ webhookSecret }) => {
  if (webhookSecret) input.value = webhookSecret;
});

function formatDate(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleString('nl-NL'); } catch { return value; }
}

function renderStatus(realworksSyncStatus = {}) {
  fields.sent.textContent = realworksSyncStatus.sent || 0;
  fields.rejected.textContent = realworksSyncStatus.rejected || 0;
  fields.duplicates.textContent = realworksSyncStatus.duplicates || 0;
  fields.errors.textContent = realworksSyncStatus.errors || 0;
  fields.extensionVersion.textContent = realworksSyncStatus.extensionVersion || chrome.runtime.getManifest().version;
  fields.lastSyncAt.textContent = formatDate(realworksSyncStatus.lastSyncAt);
  fields.lastRejectedReason.textContent = realworksSyncStatus.lastRejectedReason || '-';
  fields.lastError.textContent = realworksSyncStatus.lastError || '-';
}

function loadStatus() {
  chrome.storage.local.get('realworksSyncStatus', ({ realworksSyncStatus }) => {
    renderStatus(realworksSyncStatus);
  });
}

loadStatus();
document.getElementById('refreshStatus').addEventListener('click', loadStatus);

document.getElementById('save').addEventListener('click', () => {
  const value = input.value.trim();
  chrome.storage.local.set({ webhookSecret: value }, () => {
    status.textContent = value ? 'Opgeslagen ✓' : 'Secret gewist';
    status.className = 'status ok';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
});
