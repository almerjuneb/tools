(() => {
  const defaults = { foreground: '#13352f', background: '#fbfff4' };
  const state = {
    mode: 'url',
    logoData: '',
    logoImage: null,
    payload: '',
    generation: 0,
    toastTimer: null
  };
  const elements = {
    tabs: [...document.querySelectorAll('.mode-tab')],
    panels: [...document.querySelectorAll('.payload-panel')],
    canvas: document.querySelector('#qr-canvas'),
    placeholder: document.querySelector('#qr-placeholder'),
    form: document.querySelector('#payload-form'),
    size: document.querySelector('#size'),
    correction: document.querySelector('#correction'),
    quietZone: document.querySelector('#quiet-zone'),
    foreground: document.querySelector('#foreground'),
    background: document.querySelector('#background'),
    state: document.querySelector('#generation-state'),
    status: document.querySelector('#status-copy'),
    toast: document.querySelector('#toast'),
    png: document.querySelector('#download-png'),
    svg: document.querySelector('#download-svg'),
    copy: document.querySelector('#copy-content'),
    logoFile: document.querySelector('#logo-file'),
    logoName: document.querySelector('#logo-name'),
    removeLogo: document.querySelector('#remove-logo')
  };

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600);
  }

  function fieldValue(id) {
    return document.getElementById(id).value.trim();
  }

  function escapeWifi(value) {
    return value.replace(/[\\;,:"']/g, character => `\\${character}`);
  }

  function escapeVCard(value) {
    return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1');
  }

  function buildPayload() {
    switch (state.mode) {
      case 'url': {
        const value = fieldValue('url-value');
        if (!value) return '';
        return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
      }
      case 'text':
        return document.querySelector('#text-value').value.trim();
      case 'wifi': {
        const name = fieldValue('wifi-name');
        const security = document.querySelector('#wifi-security').value;
        const password = fieldValue('wifi-password');
        if (!name || (security !== 'nopass' && !password)) return '';
        const hidden = document.querySelector('#wifi-hidden').checked ? 'true' : 'false';
        const passwordPart = security === 'nopass' ? '' : `P:${escapeWifi(password)};`;
        return `WIFI:T:${security};S:${escapeWifi(name)};${passwordPart}H:${hidden};;`;
      }
      case 'email': {
        const address = fieldValue('email-to');
        if (!address) return '';
        const subject = fieldValue('email-subject');
        const body = fieldValue('email-body');
        const query = new URLSearchParams();
        if (subject) query.set('subject', subject);
        if (body) query.set('body', body);
        return `mailto:${address}${query.size ? `?${query.toString()}` : ''}`;
      }
      case 'phone': {
        const phone = fieldValue('phone-number');
        return phone ? `tel:${phone.replace(/[^+\d*#;,]/g, '')}` : '';
      }
      case 'contact': {
        const first = fieldValue('contact-first');
        const last = fieldValue('contact-last');
        if (!first && !last) return '';
        const phone = fieldValue('contact-phone');
        const email = fieldValue('contact-email');
        const company = fieldValue('contact-company');
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
          `FN:${escapeVCard(`${first} ${last}`.trim())}`,
          phone ? `TEL;TYPE=CELL:${escapeVCard(phone)}` : '',
          email ? `EMAIL:${escapeVCard(email)}` : '',
          company ? `ORG:${escapeVCard(company)}` : '',
          'END:VCARD'
        ].filter(Boolean).join('\r\n');
      }
      default:
        return '';
    }
  }

  function contrastRatio(first, second) {
    const luminance = color => {
      const channels = color.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  }

  function updateColorLabels() {
    document.querySelector('#foreground-value').textContent = elements.foreground.value.toUpperCase();
    document.querySelector('#background-value').textContent = elements.background.value.toUpperCase();
    document.querySelector('#contrast-warning').hidden = contrastRatio(elements.foreground.value, elements.background.value) >= 4.5;
  }

  function setGenerationState(label, isError = false) {
    elements.state.lastChild.textContent = ` ${label}`;
    elements.state.classList.toggle('error', isError);
  }

  function drawLogo() {
    if (!state.logoImage) return;
    const canvas = elements.canvas;
    const context = canvas.getContext('2d');
    const size = canvas.width * .19;
    const plateSize = size * 1.28;
    const x = (canvas.width - plateSize) / 2;
    const y = (canvas.height - plateSize) / 2;
    const radius = plateSize * .19;
    context.save();
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + plateSize, y, x + plateSize, y + plateSize, radius);
    context.arcTo(x + plateSize, y + plateSize, x, y + plateSize, radius);
    context.arcTo(x, y + plateSize, x, y, radius);
    context.arcTo(x, y, x + plateSize, y, radius);
    context.closePath();
    context.fillStyle = elements.background.value;
    context.fill();
    context.drawImage(state.logoImage, x + (plateSize - size) / 2, y + (plateSize - size) / 2, size, size);
    context.restore();
  }

  async function generate() {
    const generation = ++state.generation;
    const payload = buildPayload();
    state.payload = payload;
    document.querySelector('#content-length').textContent = `${payload.length.toLocaleString()} ${payload.length === 1 ? 'char' : 'chars'}`;
    document.querySelector('#correction-label').textContent = {
      L: 'LOW · 7%', M: 'MEDIUM · 15%', Q: 'QUARTILE · 25%', H: 'HIGH · 30%'
    }[elements.correction.value];
    updateColorLabels();

    if (!payload) {
      elements.canvas.hidden = true;
      elements.placeholder.hidden = false;
      elements.png.disabled = true;
      elements.svg.disabled = true;
      elements.copy.disabled = true;
      elements.status.textContent = 'Add content to generate a code';
      setGenerationState('WAITING');
      return;
    }
    if (!window.QRCode) {
      elements.canvas.hidden = true;
      elements.placeholder.hidden = false;
      elements.png.disabled = true;
      elements.svg.disabled = true;
      elements.copy.disabled = true;
      elements.status.textContent = 'QR engine unavailable. Check your connection.';
      setGenerationState('OFFLINE', true);
      return;
    }

    elements.placeholder.hidden = true;
    elements.canvas.hidden = false;
    setGenerationState('UPDATING');
    try {
      await QRCode.toCanvas(elements.canvas, payload, {
        width: Number(elements.size.value),
        margin: Number(elements.quietZone.value),
        errorCorrectionLevel: elements.correction.value,
        color: { dark: elements.foreground.value, light: elements.background.value }
      });
      if (generation !== state.generation) return;
      elements.canvas.style.width = 'min(86%, 288px)';
      elements.canvas.style.height = 'auto';
      drawLogo();
      elements.png.disabled = false;
      elements.svg.disabled = false;
      elements.copy.disabled = false;
      elements.status.textContent = state.logoImage ? 'Generated locally · center logo applied' : 'Generated locally in your browser';
      setGenerationState('READY');
    } catch {
      if (generation !== state.generation) return;
      elements.canvas.hidden = true;
      elements.placeholder.hidden = false;
      elements.png.disabled = true;
      elements.svg.disabled = true;
      elements.copy.disabled = true;
      elements.status.textContent = 'This content is too long or could not be encoded.';
      setGenerationState('CHECK CONTENT', true);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadSvg() {
    try {
      let svg = await QRCode.toString(state.payload, {
        type: 'svg',
        width: Number(elements.size.value),
        margin: Number(elements.quietZone.value),
        errorCorrectionLevel: elements.correction.value,
        color: { dark: elements.foreground.value, light: elements.background.value }
      });
      if (state.logoData) {
        const viewBox = svg.match(/viewBox="([^"]+)"/);
        const dimensions = viewBox ? viewBox[1].split(/\s+/).map(Number) : [0, 0, 33, 33];
        const width = dimensions[2];
        const height = dimensions[3];
        const logoSize = Math.min(width, height) * .19;
        const plateSize = logoSize * 1.28;
        const left = (width - plateSize) / 2;
        const top = (height - plateSize) / 2;
        const imageLeft = (width - logoSize) / 2;
        const imageTop = (height - logoSize) / 2;
        const overlay = `<rect x="${left}" y="${top}" width="${plateSize}" height="${plateSize}" rx="${plateSize * .18}" fill="${elements.background.value}"/><image href="${state.logoData}" x="${imageLeft}" y="${imageTop}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`;
        svg = svg.replace('</svg>', `${overlay}</svg>`);
      }
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qr-studio-code.svg');
    } catch {
      showToast('I couldn’t create the SVG file. Please try again.');
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    elements.tabs.forEach(tab => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    elements.panels.forEach(panel => { panel.hidden = panel.dataset.panel !== mode; });
    generate();
  }

  elements.tabs.forEach(tab => tab.addEventListener('click', () => switchMode(tab.dataset.mode)));
  elements.form.addEventListener('input', event => {
    if (event.target.id === 'text-value') document.querySelector('#text-count').textContent = event.target.value.length;
    generate();
  });
  elements.form.addEventListener('change', event => {
    if (event.target.id === 'wifi-security') {
      const needsPassword = event.target.value !== 'nopass';
      document.querySelector('#wifi-password-wrap').hidden = !needsPassword;
    }
    generate();
  });
  [elements.size, elements.correction, elements.quietZone, elements.foreground, elements.background].forEach(control => {
    control.addEventListener('input', () => {
      if (control === elements.size) document.querySelector('#size-output').textContent = `${control.value} px`;
      generate();
    });
    control.addEventListener('change', generate);
  });
  document.querySelectorAll('[data-reset-color]').forEach(button => button.addEventListener('click', () => {
    const control = document.getElementById(button.dataset.resetColor);
    control.value = defaults[control.id];
    generate();
  }));
  elements.logoFile.addEventListener('change', () => {
    const file = elements.logoFile.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Choose a PNG, JPG, or WebP image.'); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('Choose a logo smaller than 2 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        state.logoData = reader.result;
        state.logoImage = image;
        elements.logoName.textContent = file.name;
        elements.removeLogo.hidden = false;
        if (elements.correction.value !== 'H') elements.correction.value = 'H';
        generate();
      };
      image.onerror = () => showToast('I couldn’t load that logo image. Try another file.');
      image.src = reader.result;
    };
    reader.onerror = () => showToast('I couldn’t read that logo image. Try again.');
    reader.readAsDataURL(file);
  });
  elements.removeLogo.addEventListener('click', () => {
    state.logoData = '';
    state.logoImage = null;
    elements.logoFile.value = '';
    elements.logoName.textContent = 'No image selected';
    elements.removeLogo.hidden = true;
    generate();
  });
  elements.png.addEventListener('click', () => elements.canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, 'qr-studio-code.png');
    else showToast('I couldn’t create the PNG file. Please try again.');
  }, 'image/png'));
  elements.svg.addEventListener('click', downloadSvg);
  elements.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.payload);
      showToast('QR content copied to your clipboard.');
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = state.payload;
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
      showToast('QR content copied to your clipboard.');
    }
  });

  if (!window.QRCode) {
    setGenerationState('LOADING');
    window.addEventListener('qr-engine-ready', generate, { once: true });
    window.addEventListener('qr-engine-failed', generate, { once: true });
    window.addEventListener('load', () => {
      if (!window.QRCode) generate();
    }, { once: true });
  } else {
    generate();
  }
})();