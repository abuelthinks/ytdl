// Background service worker.
// All network calls to the local YTDL Desktop App live here. Content scripts
// can't reach http://127.0.0.1 directly because the host page's CSP (connect-src)
// blocks it — the service worker is not subject to the page CSP, so it works.

const SERVER_ADDRESS = 'http://127.0.0.1:30123';

async function checkStatus() {
  try {
    const res = await fetch(`${SERVER_ADDRESS}/status`, { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

async function sendDownload(payload) {
  const res = await fetch(`${SERVER_ADDRESS}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_STATUS') {
    checkStatus().then((connected) => sendResponse({ connected }));
    return true; // keep the channel open for the async response
  }

  if (message.type === 'DOWNLOAD') {
    sendDownload(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
