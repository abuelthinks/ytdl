// Packer unpacker helper function
function unpack(p, a, c, k, e, d) {
  e = function (c) {
    return (c < a ? '' : e(parseInt(c / a, 10))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
  };
  if (!''.replace(/^/, String)) {
    while (c--) d[e(c)] = k[c] || e(c);
    k = [function (e) { return d[e]; }];
    e = function () { return '\\w+'; };
    c = 1;
  }
  while (c--) {
    if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
  }
  return p;
}

// Registry of supported extractors
const extractors = [
  {
    name: 'kwik',
    match: () => window.location.hostname.includes('kwik.cx'),
    getVideoInfo: async () => {
      // Strategy 1: Parse inline packed scripts (Fastest, doesn't require player interaction)
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('eval(function(p,a,c,k,e,d)')) {
          try {
            // Match the arguments of the eval function
            const argRegex = /}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\(\s*(['"])\6\7\s*\)/;
            const match = text.match(argRegex);
            if (match) {
              const p = match[2];
              const a = parseInt(match[3], 10);
              const c = parseInt(match[4], 10);
              const k = match[6].split(match[7]);

              const unpacked = unpack(p, a, c, k, 0, {});
              const urlRegex = /source\s*[:=]\s*['"](https?:\/\/[^'"]+)/;
              const urlMatch = unpacked.match(urlRegex);
              
              if (urlMatch && urlMatch[1]) {
                console.log('[YTDL Helper] Extracted URL from script:', urlMatch[1]);
                return {
                  url: urlMatch[1],
                  title: document.title.replace(' - Kwik', '').trim(),
                  referer: window.location.href
                };
              }
            }
          } catch (err) {
            console.error('[YTDL Helper] Error parsing packed script:', err);
          }
        }
      }

      // Strategy 2: Fallback to querying the DOM <video> element (in case page layout changes)
      return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const video = document.querySelector('video');
          if (video && video.src && video.src.startsWith('http')) {
            clearInterval(interval);
            console.log('[YTDL Helper] Extracted URL from video tag:', video.src);
            resolve({
              url: video.src,
              title: document.title.replace(' - Kwik', '').trim(),
              referer: window.location.href
            });
          } else if (attempts > 20) { // Timeout after 10s
            clearInterval(interval);
            resolve(null);
          }
        }, 500);
      });
    },
    insertButton: (onDownloadClick) => {
      // Find a good place to insert the button
      // Kwik.cx has a #player or container element
      const target = document.getElementById('player') || document.querySelector('.card') || document.body;
      
      const container = document.createElement('div');
      container.id = 'ytdl-helper-container';
      container.style.cssText = `
        margin: 15px auto;
        max-width: 800px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      `;

      const button = document.createElement('button');
      button.id = 'ytdl-download-btn';
      button.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 600;
        border-radius: 8px;
        cursor: pointer;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: all 0.2s ease;
        opacity: 0.7;
      `;
      button.disabled = true;

      // Status indicator dot
      const indicator = document.createElement('span');
      indicator.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #ef4444;
        display: inline-block;
        box-shadow: 0 0 8px #ef4444;
      `;

      const textNode = document.createTextNode('Checking YTDL App Connection...');
      
      button.appendChild(indicator);
      button.appendChild(textNode);
      container.appendChild(button);

      if (target === document.body || !target.parentNode) {
        // Fallback to floating style if no suitable container found
        container.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 99999;
          display: flex;
          align-items: center;
        `;
        document.body.appendChild(container);
      } else {
        // Insert right after the target element
        target.parentNode.insertBefore(container, target.nextSibling);
      }

      button.addEventListener('click', onDownloadClick);

      // Return a control function to update state
      return {
        updateStatus: (isConnected) => {
          button.disabled = !isConnected;
          if (isConnected) {
            button.style.opacity = '1';
            button.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            indicator.style.backgroundColor = '#10b981';
            indicator.style.boxShadow = '0 0 8px #10b981';
            textNode.textContent = 'Download in YTDL App';
          } else {
            button.style.opacity = '0.7';
            button.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
            indicator.style.backgroundColor = '#ef4444';
            indicator.style.boxShadow = '0 0 8px #ef4444';
            textNode.textContent = 'Open YTDL App to Download';
          }
        },
        updateLoading: (message) => {
          button.disabled = true;
          button.style.opacity = '0.8';
          indicator.style.backgroundColor = '#f59e0b';
          indicator.style.boxShadow = '0 0 8px #f59e0b';
          textNode.textContent = message || 'Processing...';
        }
      };
    }
  }
];

// Main logic
async function init() {
  const extractor = extractors.find(e => e.match());
  if (!extractor) return;

  console.log('[YTDL Helper] Active extractor:', extractor.name);

  let controls = null;
  let serverConnected = false;

  const checkConnection = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
      serverConnected = !!(res && res.connected);
    } catch {
      serverConnected = false;
    }

    if (controls) {
      controls.updateStatus(serverConnected);
    }
  };

  // Trigger download function
  const handleDownload = async () => {
    if (!serverConnected) return;

    if (controls) {
      controls.updateLoading('Extracting Link...');
    }

    const info = await extractor.getVideoInfo();
    if (!info) {
      alert('Failed to extract video information from the page.');
      if (controls) controls.updateStatus(serverConnected);
      return;
    }

    if (controls) {
      controls.updateLoading('Sending to YTDL App...');
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'DOWNLOAD', payload: info });

      if (response && response.ok && response.result && response.result.success) {
        if (controls) {
          controls.updateLoading('Download Started!');
          setTimeout(() => {
            controls.updateStatus(serverConnected);
          }, 2000);
        }
      } else {
        const errMsg =
          (response && (response.error || (response.result && response.result.error))) ||
          'Unknown error';
        alert('Failed to start download: ' + errMsg);
        if (controls) controls.updateStatus(serverConnected);
      }
    } catch (err) {
      alert('Error sending command to YTDL App: ' + err.message);
      if (controls) controls.updateStatus(serverConnected);
    }
  };

  // Inject UI
  controls = extractor.insertButton(handleDownload);

  // Poll connection status
  await checkConnection();
  setInterval(checkConnection, 3000);
}

// Run the script
init();
