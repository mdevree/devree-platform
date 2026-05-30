// Opties-pagina: beheert het webhook secret in chrome.storage.local.

const input = document.getElementById('secret');
const status = document.getElementById('status');

// Bestaande waarde inladen.
chrome.storage.local.get('webhookSecret', ({ webhookSecret }) => {
  if (webhookSecret) input.value = webhookSecret;
});

document.getElementById('save').addEventListener('click', () => {
  const value = input.value.trim();
  chrome.storage.local.set({ webhookSecret: value }, () => {
    status.textContent = value ? 'Opgeslagen ✓' : 'Secret gewist';
    status.className = 'status ok';
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
});
