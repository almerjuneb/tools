(() => {
  const limits = { fileBytes: 20 * 1024 * 1024, side: 8000, pixels: 30_000_000 };
  const libraries = {};
  const state = { file: null, source: null, sourceUrl: '', resultBlob: null, resultUrl: '', resultType: '', operation: 'remove', busy: false };
  const elements = {
    file: document.querySelector('#image-file'),
    drop: document.querySelector('#drop-zone'),
    summary: document.querySelector('#file-summary'),
    preview: document.querySelector('#image-preview'),
    stage: document.querySelector('#preview-stage'),
    empty: document.querySelector('#preview-empty'),
    status: document.querySelector('#processing-status'),
    message: document.querySelector('#status-message'),
    download: document.querySelector('#download-image'),
    tabs: [...document.querySelectorAll('.tool-tab')],
    panels: [...document.querySelectorAll('.operation-panel')]
  };

  function humanSize(bytes) {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function setStatus(message, stateClass = '') {
    elements.message.textContent = message;
    elements.status.classList.remove('busy', 'error', 'success');
    if (stateClass) elements.status.classList.add(stateClass);
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2800);
  }

  function loadLibrary(name, url) {
    libraries[name] ??= import(url);
    return libraries[name];
  }

  function setBusy(busy) {
    state.busy = busy;
    for (const id of ['remove-background', 'upscale-image', 'convert-image']) {
      const button = document.getElementById(id);
      button.disabled = busy || !state.file;
    }
    elements.file.disabled = busy;
  }

  function updateActions() {
    for (const id of ['remove-background', 'upscale-image', 'convert-image']) {
      document.getElementById(id).disabled = state.busy || !state.file;
    }
    elements.download.disabled = !state.resultBlob || state.busy;
  }

  function revokeResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = '';
    state.resultBlob = null;
    state.resultType = '';
    elements.download.disabled = true;
    document.querySelector('#output-info').textContent = '—';
  }

  function setResult(blob, type, label) {
    revokeResult();
    state.resultBlob = blob;
    state.resultType = type;
    state.resultUrl = URL.createObjectURL(blob);
    elements.preview.src = state.resultUrl;
    elements.preview.hidden = false;
    elements.empty.hidden = true;
    document.querySelector('#preview-label').textContent = label;
    document.querySelector('#output-info').textContent = humanSize(blob.size);
    document.querySelector('#download-format').textContent = type.split('/')[1].toUpperCase();
    elements.download.disabled = false;
    document.querySelector('#compare-control').hidden = false;
    setStatus(`${label} ready · ${humanSize(blob.size)}`, 'success');
  }

  async function acceptFile(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > limits.fileBytes) {
      showToast('Choose an image smaller than 20 MB.');
      return;
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      showToast('I couldn’t open that image. Try another file.');
      return;
    }
    if (bitmap.width > limits.side || bitmap.height > limits.side || bitmap.width * bitmap.height > limits.pixels) {
      bitmap.close();
      showToast('This image is too large to process safely in the browser.');
      return;
    }

    if (state.source) state.source.close();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    revokeResult();
    state.file = file;
    state.source = bitmap;
    state.sourceUrl = URL.createObjectURL(file);
    elements.preview.src = state.sourceUrl;
    elements.preview.hidden = false;
    elements.empty.hidden = true;
    elements.summary.hidden = false;
    elements.drop.hidden = true;
    document.querySelector('#file-name').textContent = file.name;
    document.querySelector('#file-details').textContent = `${bitmap.width} × ${bitmap.height} px · ${humanSize(file.size)}`;
    document.querySelector('#file-type').textContent = file.type.split('/')[1].toUpperCase();
    document.querySelector('#preview-label').textContent = 'ORIGINAL';
    document.querySelector('#output-info').textContent = `${bitmap.width} × ${bitmap.height} px`;
    document.querySelector('#compare-control').hidden = true;
    document.querySelector('#compare-original').checked = false;
    document.querySelector('#output-dimensions strong').textContent = `${bitmap.width} × ${bitmap.height} px`;
    document.querySelector('#width').placeholder = String(bitmap.width);
    document.querySelector('#height').placeholder = String(bitmap.height);
    elements.stage.classList.remove('checker-off');
    updateActions();
    setStatus('Image ready. Choose an operation to begin.');
  }

  async function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), type, quality));
  }

  async function resizeSource(width, height) {
    const module = await loadLibrary('pica', 'https://cdn.jsdelivr.net/npm/pica@9.0.1/+esm');
    const pica = module.default();
    const source = document.createElement('canvas');
    source.width = state.source.width;
    source.height = state.source.height;
    source.getContext('2d', { alpha: false }).drawImage(state.source, 0, 0);
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    await pica.resize(source, target, { quality: 3, unsharpAmount: 70, unsharpRadius: .6, unsharpThreshold: 2 });
    return target;
  }

  async function removeBackground() {
    if (!state.file || state.busy) return;
    setBusy(true);
    setStatus('Loading the AI engine… first run may take a little longer.', 'busy');
    try {
      const module = await loadLibrary('background', 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm');
      const blob = await module.removeBackground(state.file, {
        model: 'isnet_quint8',
        progress: (key, current, total) => {
          if (total > 0) setStatus(`Preparing image model · ${Math.round(current / total * 100)}%`, 'busy');
          else setStatus('Removing the background…', 'busy');
        }
      });
      setResult(blob, 'image/png', 'BACKGROUND REMOVED');
      elements.stage.style.setProperty('--checker', document.querySelector('#matte-color').value);
    } catch (error) {
      setStatus('Background removal did not finish. Check your connection and try again.', 'error');
      showToast(error?.message || 'I couldn’t remove the background. Try another image.');
    } finally {
      setBusy(false);
      updateActions();
    }
  }

  async function upscaleImage() {
    if (!state.source || state.busy) return;
    const factor = Number(document.querySelector('input[name="scale"]:checked').value);
    const width = state.source.width * factor;
    const height = state.source.height * factor;
    if (width > limits.side || height > limits.side || width * height > limits.pixels) {
      showToast('That output would be too large for safe browser processing. Choose 2× or a smaller source image.');
      return;
    }
    setBusy(true);
    setStatus('Enlarging with high-quality resampling…', 'busy');
    try {
      const canvas = await resizeSource(width, height);
      const blob = await canvasBlob(canvas, 'image/png');
      setResult(blob, 'image/png', 'UPSCALED');
    } catch (error) {
      setStatus('Upscaling did not finish.', 'error');
      showToast(error?.message || 'I couldn’t upscale this image.');
    } finally {
      setBusy(false);
      updateActions();
    }
  }

  async function convertImage() {
    if (!state.source || state.busy) return;
    const targetWidth = Number(document.querySelector('#width').value) || state.source.width;
    const targetHeight = Number(document.querySelector('#height').value) || state.source.height;
    if (targetWidth > limits.side || targetHeight > limits.side || targetWidth * targetHeight > limits.pixels) {
      showToast('Enter dimensions no larger than 8,000 px per side or 30 megapixels total.');
      return;
    }
    const type = document.querySelector('#format').value;
    const quality = Number(document.querySelector('#quality').value) / 100;
    setBusy(true);
    setStatus('Preparing your image…', 'busy');
    try {
      const canvas = targetWidth === state.source.width && targetHeight === state.source.height
        ? (() => { const result = document.createElement('canvas'); result.width = targetWidth; result.height = targetHeight; result.getContext('2d').drawImage(state.source, 0, 0); return result; })()
        : await resizeSource(targetWidth, targetHeight);
      if (type === 'image/jpeg') {
        const context = canvas.getContext('2d');
        const original = context.getImageData(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = document.querySelector('#jpg-color').value;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';
        const blob = await canvasBlob(canvas, type, quality);
        context.putImageData(original, 0, 0);
        setResult(blob, type, 'CONVERTED');
      } else {
        const blob = await canvasBlob(canvas, type, type === 'image/png' ? undefined : quality);
        setResult(blob, type, 'CONVERTED');
      }
    } catch (error) {
      setStatus('Conversion did not finish.', 'error');
      showToast(error?.message || 'I couldn’t convert this image.');
    } finally {
      setBusy(false);
      updateActions();
    }
  }

  function setOperation(operation) {
    if (state.busy) return;
    state.operation = operation;
    elements.tabs.forEach(tab => {
      const active = tab.dataset.operation === operation;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    elements.panels.forEach(panel => { panel.hidden = panel.dataset.panel !== operation; });
    revokeResult();
    if (state.file) {
      elements.preview.src = state.sourceUrl;
      elements.preview.hidden = false;
      elements.empty.hidden = true;
      document.querySelector('#preview-label').textContent = 'ORIGINAL';
      document.querySelector('#output-info').textContent = `${state.source.width} × ${state.source.height} px`;
      document.querySelector('#compare-control').hidden = true;
      setStatus('Choose the settings, then run this operation.');
    }
    updateActions();
  }

  elements.tabs.forEach(tab => tab.addEventListener('click', () => setOperation(tab.dataset.operation)));
  elements.file.addEventListener('change', () => acceptFile(elements.file.files[0]));
  document.querySelector('#remove-image').addEventListener('click', () => {
    if (state.busy) return;
    if (state.source) state.source.close();
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.file = null;
    state.source = null;
    state.sourceUrl = '';
    revokeResult();
    elements.file.value = '';
    elements.file.disabled = false;
    elements.drop.hidden = false;
    elements.summary.hidden = true;
    elements.preview.hidden = true;
    elements.empty.hidden = false;
    document.querySelector('#compare-control').hidden = true;
    document.querySelector('#preview-label').textContent = 'NO IMAGE';
    document.querySelector('#output-info').textContent = '—';
    setStatus('Choose an image to begin.');
    updateActions();
  });
  document.querySelector('#remove-background').addEventListener('click', removeBackground);
  document.querySelector('#upscale-image').addEventListener('click', upscaleImage);
  document.querySelector('#convert-image').addEventListener('click', convertImage);
  document.querySelector('#download-image').addEventListener('click', () => {
    if (!state.resultBlob) return;
    const extension = state.resultType === 'image/jpeg' ? 'jpg' : state.resultType.split('/')[1];
    const link = document.createElement('a');
    link.href = state.resultUrl;
    link.download = `${state.file.name.replace(/\.[^.]+$/, '')}-ajb.${extension}`;
    link.click();
  });
  document.querySelector('#compare-original').addEventListener('change', event => {
    if (!state.file) return;
    elements.preview.src = event.target.checked ? state.sourceUrl : state.resultUrl;
    document.querySelector('#preview-label').textContent = event.target.checked ? 'ORIGINAL' : 'EDITED RESULT';
  });
  document.querySelector('#quality').addEventListener('input', event => { document.querySelector('#quality-value').textContent = `${event.target.value}%`; });
  document.querySelector('#format').addEventListener('change', event => { document.querySelector('#jpg-background').style.display = event.target.value === 'image/jpeg' ? 'flex' : 'none'; });
  document.querySelector('#matte-color').addEventListener('input', event => {
    document.querySelector('#matte-value').textContent = event.target.value.toUpperCase();
    elements.stage.style.setProperty('--checker', event.target.value);
  });
  document.querySelector('#jpg-color').addEventListener('input', event => { document.querySelector('#jpg-value').textContent = event.target.value.toUpperCase(); });
  document.querySelectorAll('input[name="scale"]').forEach(input => input.addEventListener('change', () => {
    if (state.source) {
      const factor = Number(input.value);
      document.querySelector('#output-dimensions strong').textContent = `${state.source.width * factor} × ${state.source.height * factor} px`;
    }
  }));
  ['width', 'height'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', () => {
    if (state.resultBlob && state.operation === 'convert') revokeResult();
  }));
  ['dragenter', 'dragover'].forEach(type => elements.drop.addEventListener(type, event => { event.preventDefault(); elements.drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => elements.drop.addEventListener(type, event => { event.preventDefault(); elements.drop.classList.remove('dragging'); }));
  elements.drop.addEventListener('drop', event => acceptFile(event.dataTransfer.files[0]));

  document.querySelector('#format').dispatchEvent(new Event('change'));
  updateActions();
})();