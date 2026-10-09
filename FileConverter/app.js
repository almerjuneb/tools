(() => {
  const urls = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs',
    docx: 'https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm',
    zip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm',
    jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'
  };
  const state = { mode: 'pdf-docx', files: [], pdf: null, output: null, name: '', libs: {}, busy: false, previewUrl: '' };
  const elements = {
    tabs: [...document.querySelectorAll('.mode-button')],
    input: document.querySelector('#file-input'),
    drop: document.querySelector('#drop-zone'),
    description: document.querySelector('#mode-description'),
    list: document.querySelector('#file-list'),
    convert: document.querySelector('#convert-button'),
    clear: document.querySelector('#clear-button'),
    download: document.querySelector('#download-button'),
    progress: document.querySelector('#progress-track'),
    progressBar: document.querySelector('#progress-bar'),
    status: document.querySelector('#status-line'),
    preview: document.querySelector('#preview-image'),
    empty: document.querySelector('#preview-empty')
  };

  function library(name) {
    state.libs[name] ??= import(urls[name]);
    return state.libs[name];
  }

  function showStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', isError);
  }

  function setProgress(value, message) {
    elements.progress.hidden = false;
    elements.progressBar.style.width = `${Math.max(0, Math.min(value, 100))}%`;
    showStatus(message);
  }

  function finishProgress(message, isError = false) {
    elements.progress.hidden = true;
    elements.progressBar.style.width = '0%';
    showStatus(message, isError);
  }

  function revokeOutput() {
    state.output = null;
    state.name = '';
    elements.download.disabled = true;
  }

  function clearPreview() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
    elements.preview.removeAttribute('src');
    elements.preview.hidden = true;
    elements.empty.hidden = false;
  }

  function setPreview(blob, label) {
    clearPreview();
    state.previewUrl = URL.createObjectURL(blob);
    elements.preview.src = state.previewUrl;
    elements.preview.alt = label;
    elements.preview.hidden = false;
    elements.empty.hidden = true;
  }

  function updateMode() {
    const activeMode = state.mode;
    elements.tabs.forEach(tab => {
      const active = tab.dataset.mode === activeMode;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const descriptions = {
      'pdf-docx': { kicker: 'VISUAL LAYOUT / PAGE BY PAGE', title: 'PDF to Word', text: 'For the closest visual match, I render each PDF page as a high-resolution image and place it on its own Word page.' },
      'pdf-images': { kicker: 'PAGE EXTRACTION / PNG ARCHIVE', title: 'PDF to page images', text: 'Render every page as a crisp PNG and collect the images in one ZIP archive.' },
      'images-pdf': { kicker: 'BATCH COMPOSITION / PDF', title: 'Images to PDF', text: 'Combine a group of images into one PDF. Each page is fitted to the selected paper size without cropping.' }
    }[activeMode];
    elements.description.querySelector('.step-label').textContent = descriptions.kicker;
    elements.description.querySelector('h2').textContent = descriptions.title;
    elements.description.querySelector('p').textContent = descriptions.text;
    const fidelity = elements.description.querySelector('.fidelity-note');
    fidelity.hidden = activeMode !== 'pdf-docx';
    document.querySelector('#pdf-options').hidden = activeMode === 'images-pdf';
    document.querySelector('#image-options').hidden = activeMode !== 'images-pdf';
    elements.input.accept = activeMode === 'images-pdf' ? 'image/png,image/jpeg,image/webp' : 'application/pdf,.pdf';
    elements.input.multiple = activeMode === 'images-pdf';
    document.querySelector('#drop-title').textContent = activeMode === 'images-pdf' ? 'Drop images to create a PDF' : 'Drop a PDF to get started';
    document.querySelector('.drop-copy small').innerHTML = activeMode === 'images-pdf' ? '<span>Browse files</span> · PNG, JPG, WebP · up to 20 images' : '<span>Browse files</span> · PDF · up to 40 MB';
    document.querySelector('#output-type').textContent = activeMode === 'pdf-docx' ? 'DOCX · VISUAL' : activeMode === 'pdf-images' ? 'PNG · ZIP' : 'PDF';
    document.querySelector('#download-label').textContent = activeMode === 'pdf-docx' ? 'Convert to DOCX' : activeMode === 'pdf-images' ? 'Download PNG archive' : 'Create PDF';
    elements.convert.querySelector('span:first-child').textContent = activeMode === 'images-pdf' ? 'Create PDF' : 'Convert files';
    if (activeMode === 'images-pdf' && elements.input.files.length) elements.input.value = '';
    state.files = [];
    state.pdf = null;
    elements.list.replaceChildren();
    elements.list.hidden = true;
    document.querySelector('#selected-count').textContent = '0 files';
    elements.convert.disabled = true;
    elements.clear.disabled = true;
    revokeOutput();
    clearPreview();
    finishProgress('Choose a file to see the conversion options.');
  }

  function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function renderFileList() {
    elements.list.replaceChildren(...state.files.map(file => {
      const row = document.createElement('div');
      row.className = 'file-item';
      const badge = document.createElement('span');
      badge.className = 'file-badge';
      badge.textContent = file.type === 'application/pdf' ? 'PDF' : file.type.split('/')[1].slice(0, 4).toUpperCase();
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;
      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatBytes(file.size);
      row.append(badge, name, size);
      return row;
    }));
    elements.list.hidden = state.files.length === 0;
    document.querySelector('#selected-count').textContent = `${state.files.length} ${state.files.length === 1 ? 'file' : 'files'}`;
    elements.convert.disabled = state.files.length === 0 || state.busy;
    elements.clear.disabled = state.files.length === 0 || state.busy;
  }

  async function openPdf(file) {
    const pdfjs = await library('pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await task.promise;
    const cap = Number(document.querySelector('#page-cap').value);
    if (pdf.numPages > cap) {
      await pdf.destroy();
      throw new Error(`This file has ${pdf.numPages} pages. The current limit is ${cap}; select a higher limit or split the PDF.`);
    }
    state.pdf = pdf;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: Math.min(.55, 720 / page.getViewport({ scale: 1 }).width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob) setPreview(blob, `Page 1 preview of ${file.name}`);
    document.querySelector('#preview-title').textContent = `${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'} detected`;
    finishProgress(`Ready to convert ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}.`);
  }

  async function acceptFiles(fileList) {
    const selected = [...fileList];
    if (!selected.length) return;
    revokeOutput();
    clearPreview();
    state.files = [];
    state.pdf = null;
    if (state.mode === 'images-pdf') {
      if (selected.length > 20) { showStatus('Choose 20 images or fewer.', true); return; }
      if (selected.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) { showStatus('Choose PNG, JPEG, or WebP images only.', true); return; }
      if (selected.reduce((total, file) => total + file.size, 0) > 80 * 1024 * 1024) { showStatus('The selected images exceed the 80 MB total limit.', true); return; }
    } else {
      if (selected.length !== 1 || (selected[0].type !== 'application/pdf' && !selected[0].name.toLowerCase().endsWith('.pdf'))) { showStatus('Choose one PDF file.', true); return; }
      if (selected[0].size > 40 * 1024 * 1024) { showStatus('Choose a PDF smaller than 40 MB.', true); return; }
    }
    state.files = selected;
    renderFileList();
    if (state.mode === 'images-pdf') {
      setPreview(selected[0], `Preview of ${selected[0].name}`);
      document.querySelector('#preview-title').textContent = `${selected.length} ${selected.length === 1 ? 'image' : 'images'} selected`;
      finishProgress('Image batch is ready to combine.');
      return;
    }
    elements.convert.disabled = true;
    elements.clear.disabled = true;
    setProgress(15, 'Reading PDF and preparing its first-page preview…');
    try {
      await openPdf(selected[0]);
      elements.convert.disabled = false;
      elements.clear.disabled = false;
    } catch (error) {
      state.files = [];
      state.pdf = null;
      renderFileList();
      finishProgress(error.message || 'I couldn’t read this PDF.', true);
    }
  }

  function filenameBase(file) {
    return file.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 90) || 'converted-file';
  }

  function outputBlob(blob, filename, message) {
    state.output = blob;
    state.name = filename;
    elements.download.disabled = false;
    document.querySelector('#preview-title').textContent = 'Conversion complete';
    finishProgress(message);
  }

  function canvasPng(page, scale) {
    return new Promise(async (resolve, reject) => {
      try {
        const base = page.getViewport({ scale: 1 });
        const fit = Math.min(1, 1584 / base.width, 1584 / base.height);
        const renderScale = Math.min(fit * scale, Math.sqrt(8_000_000 / (base.width * base.height)));
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        canvas.toBlob(async blob => {
          if (!blob) { reject(new Error(`Couldn’t render PDF page ${page.pageNumber}.`)); return; }
          resolve({ blob, data: new Uint8Array(await blob.arrayBuffer()), width: base.width * fit, height: base.height * fit });
          canvas.width = 0;
          canvas.height = 0;
        }, 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  async function pdfToDocx(file) {
    const docx = await library('docx');
    const pdf = state.pdf || await openPdf(file).then(() => state.pdf);
    const dpi = Number(document.querySelector('#quality').value);
    const sections = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      setProgress(10 + (number - 1) / pdf.numPages * 75, `Rendering page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      const rendered = await canvasPng(page, dpi / 72);
      const width = Math.round(rendered.width * 20);
      const height = Math.round(rendered.height * 20);
      const image = new docx.ImageRun({ data: rendered.data, type: 'png', transformation: { width: rendered.width * 4 / 3, height: rendered.height * 4 / 3 } });
      sections.push({
        properties: { page: { size: { width, height }, margin: { top: 0, right: 0, bottom: 0, left: 0 } } },
        children: [new docx.Paragraph({ spacing: { before: 0, after: 0, line: 1 }, children: [image] })]
      });
    }
    setProgress(90, 'Assembling the Word document…');
    const documentFile = new docx.Document({ title: `${filenameBase(file)} · layout-preserved`, creator: 'AJB Tools', sections });
    const blob = await docx.Packer.toBlob(documentFile);
    if (pdf.destroy) await pdf.destroy();
    state.pdf = null;
    outputBlob(blob, `${filenameBase(file)}-layout.docx`, 'DOCX ready. Each page retains its original visual layout as an image.');
  }

  async function pdfToImages(file) {
    const Zip = (await library('zip')).default;
    const pdf = state.pdf || await openPdf(file).then(() => state.pdf);
    const dpi = Number(document.querySelector('#quality').value);
    const zip = new Zip();
    for (let number = 1; number <= pdf.numPages; number += 1) {
      setProgress(5 + (number - 1) / pdf.numPages * 85, `Exporting page ${number} of ${pdf.numPages}…`);
      const rendered = await canvasPng(await pdf.getPage(number), dpi / 72);
      zip.file(`${filenameBase(file)}-page-${String(number).padStart(3, '0')}.png`, rendered.blob);
    }
    setProgress(92, 'Packing PNG pages into a ZIP archive…');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    if (pdf.destroy) await pdf.destroy();
    state.pdf = null;
    outputBlob(blob, `${filenameBase(file)}-pages.zip`, `${pdf.numPages} PNG pages are ready in your ZIP archive.`);
  }

  function canvasForImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn’t open ${file.name}.`)); };
      image.src = url;
    });
  }

  async function imagesToPdf(files) {
    const { jsPDF } = await library('jspdf');
    const quality = Number(document.querySelector('#pdf-quality').value) / 100;
    const pageChoice = document.querySelector('#page-size').value;
    const orientationChoice = document.querySelector('#orientation').value;
    let pdf = null;
    for (let index = 0; index < files.length; index += 1) {
      setProgress(5 + index / files.length * 85, `Adding image ${index + 1} of ${files.length}…`);
      const image = await canvasForImage(files[index]);
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      const inferredOrientation = naturalWidth > naturalHeight ? 'landscape' : 'portrait';
      const orientation = orientationChoice === 'auto' ? inferredOrientation : orientationChoice;
      const format = pageChoice === 'source' ? [naturalWidth * .75, naturalHeight * .75] : pageChoice;
      if (!pdf) pdf = new jsPDF({ orientation, unit: 'pt', format, compress: true });
      else pdf.addPage(format, orientation);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = pageChoice === 'source' ? 0 : 24;
      const fit = Math.min((pageWidth - margin * 2) / naturalWidth, (pageHeight - margin * 2) / naturalHeight);
      const width = naturalWidth * fit;
      const height = naturalHeight * fit;
      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const data = canvas.toDataURL('image/jpeg', quality);
      pdf.addImage(data, 'JPEG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST');
      canvas.width = 0;
      canvas.height = 0;
    }
    setProgress(95, 'Preparing your PDF…');
    outputBlob(pdf.output('blob'), `${filenameBase(files[0])}${files.length > 1 ? `-plus-${files.length - 1}-images` : ''}.pdf`, `${files.length} ${files.length === 1 ? 'image is' : 'images are'} ready in your PDF.`);
  }

  async function convert() {
    if (!state.files.length || state.busy) return;
    state.busy = true;
    elements.convert.disabled = true;
    elements.clear.disabled = true;
    revokeOutput();
    try {
      if (state.mode === 'pdf-docx') await pdfToDocx(state.files[0]);
      else if (state.mode === 'pdf-images') await pdfToImages(state.files[0]);
      else await imagesToPdf(state.files);
    } catch (error) {
      finishProgress(error.message || 'Conversion didn’t complete. Try another file.', true);
    } finally {
      state.busy = false;
      elements.convert.disabled = state.files.length === 0;
      elements.clear.disabled = state.files.length === 0;
    }
  }

  function clearFiles() {
    if (state.busy) return;
    if (state.pdf?.destroy) state.pdf.destroy();
    state.pdf = null;
    state.files = [];
    elements.input.value = '';
    elements.list.replaceChildren();
    elements.list.hidden = true;
    document.querySelector('#selected-count').textContent = '0 files';
    document.querySelector('#preview-title').textContent = 'Ready when you are';
    revokeOutput();
    clearPreview();
    elements.convert.disabled = true;
    elements.clear.disabled = true;
    finishProgress('Choose a file to see the conversion options.');
  }

  elements.tabs.forEach(tab => tab.addEventListener('click', () => {
    if (state.busy) return;
    state.mode = tab.dataset.mode;
    elements.input.value = '';
    updateMode();
  }));
  elements.input.addEventListener('change', () => acceptFiles(elements.input.files));
  elements.convert.addEventListener('click', convert);
  elements.clear.addEventListener('click', clearFiles);
  elements.download.addEventListener('click', () => {
    if (!state.output) return;
    const url = URL.createObjectURL(state.output);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.name;
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector('#quality').addEventListener('change', () => {
    if (state.files[0]?.type === 'application/pdf' || state.files[0]?.name.toLowerCase().endsWith('.pdf')) acceptFiles(state.files);
  });
  document.querySelector('#page-cap').addEventListener('change', () => {
    if (state.files[0]?.type === 'application/pdf' || state.files[0]?.name.toLowerCase().endsWith('.pdf')) acceptFiles(state.files);
  });
  document.querySelector('#pdf-quality').addEventListener('input', event => { document.querySelector('#pdf-quality-value').textContent = `${event.target.value}%`; });
  ['dragenter', 'dragover'].forEach(type => elements.drop.addEventListener(type, event => { event.preventDefault(); elements.drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => elements.drop.addEventListener(type, event => { event.preventDefault(); elements.drop.classList.remove('dragging'); }));
  elements.drop.addEventListener('drop', event => acceptFiles(event.dataTransfer.files));

  updateMode();
})();