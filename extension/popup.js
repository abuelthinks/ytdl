document.addEventListener('DOMContentLoaded', () => {
  const statusCard = document.getElementById('status-card');
  const statusText = document.getElementById('status-text');
  const downloadBtn = document.getElementById('download-tab-btn');
  const resultText = document.getElementById('action-result');
  const formatToggle = document.getElementById('format-toggle');

  let connected = false;
  let selectedFormat = 'best';

  const setResult = (message, type) => {
    resultText.textContent = message || '';
    resultText.className = 'action-result' + (type ? ` ${type}` : '');
  };

  const renderStatus = (isConnected) => {
    connected = isConnected;
    if (isConnected) {
      statusCard.className = 'status-card connected';
      statusText.textContent = 'Connected to YTDL App';
    } else {
      statusCard.className = 'status-card disconnected';
      statusText.textContent = 'Disconnected — open the YTDL App';
    }
    downloadBtn.disabled = !isConnected;
  };

  const checkStatus = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
      renderStatus(!!(res && res.connected));
    } catch {
      renderStatus(false);
    }
  };

  formatToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.fmt-btn');
    if (!btn) return;
    selectedFormat = btn.dataset.format;
    formatToggle
      .querySelectorAll('.fmt-btn')
      .forEach((b) => b.classList.toggle('active', b === btn));
  });

  downloadBtn.addEventListener('click', async () => {
    if (!connected) return;
    setResult('');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:\/\//.test(tab.url)) {
      setResult("This page can't be downloaded.", 'error');
      return;
    }

    downloadBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;
    downloadBtn.textContent = 'Sending...';

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD',
        payload: { url: tab.url, title: tab.title, format: selectedFormat }
      });

      if (res && res.ok && res.result && res.result.success) {
        setResult('Sent to YTDL App!', 'success');
      } else {
        const err =
          (res && (res.error || (res.result && res.result.error))) || 'Unknown error';
        setResult('Failed: ' + err, 'error');
      }
    } catch (err) {
      setResult('Error: ' + err.message, 'error');
    } finally {
      downloadBtn.textContent = originalLabel;
      downloadBtn.disabled = !connected;
    }
  });

  checkStatus();
  const interval = setInterval(checkStatus, 2000);
  window.addEventListener('unload', () => clearInterval(interval));
});
