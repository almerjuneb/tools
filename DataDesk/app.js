(() => {
  'use strict';

  const state = { tables: [], activeTableId: null, pending: null, toastTimer: null };
  const elements = {
    fileInput: document.getElementById('fileInput'), browseButton: document.getElementById('browseButton'), emptyImportButton: document.getElementById('emptyImportButton'),
    dropZone: document.getElementById('dropZone'), newTableButton: document.getElementById('newTableButton'), tableCount: document.getElementById('tableCount'),
    emptyState: document.getElementById('emptyState'), tableEditor: document.getElementById('tableEditor'), tableTabs: document.getElementById('tableTabs'),
    tableName: document.getElementById('tableName'), tableMeta: document.getElementById('tableMeta'), table: document.getElementById('dataTable'),
    rowStatus: document.getElementById('rowStatus'), sourceStatus: document.getElementById('sourceStatus'), searchInput: document.getElementById('searchInput'),
    sortColumn: document.getElementById('sortColumn'), addRowButton: document.getElementById('addRowButton'), deleteTableButton: document.getElementById('deleteTableButton'),
    addColumnForm: document.getElementById('addColumnForm'), newColumnName: document.getElementById('newColumnName'), exportCsvButton: document.getElementById('exportCsvButton'),
    exportXlsxButton: document.getElementById('exportXlsxButton'), importDialog: document.getElementById('importDialog'), importForm: document.getElementById('importForm'),
    importFileName: document.getElementById('importFileName'), sourceSheet: document.getElementById('sourceSheet'), headerRow: document.getElementById('headerRow'),
    importTableName: document.getElementById('importTableName'), destinationTable: document.getElementById('destinationTable'), appendChoice: document.getElementById('appendChoice'),
    columnChoices: document.getElementById('columnChoices'), selectedColumnCount: document.getElementById('selectedColumnCount'), selectAllFields: document.getElementById('selectAllFields'),
    clearAllFields: document.getElementById('clearAllFields'), importPreview: document.getElementById('importPreview'), previewMeta: document.getElementById('previewMeta'),
    importMessage: document.getElementById('importMessage'), confirmImportButton: document.getElementById('confirmImportButton'), closeImportButton: document.getElementById('closeImportButton'),
    cancelImportButton: document.getElementById('cancelImportButton'), toast: document.getElementById('toast')
  };

  function activeTable() {
    return state.tables.find(table => table.id === state.activeTableId) || null;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3100);
  }

  function safeName(value, fallback) {
    const name = String(value || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    return name || fallback;
  }

  function baseName(fileName) {
    return String(fileName).replace(/\.[^.]+$/, '');
  }

  function parseDelimited(text) {
    const cleanText = text.replace(/^\uFEFF/, '');
    const firstLine = cleanText.split(/\r?\n/, 1)[0] || '';
    const delimiters = ['\t', ',', ';', '|'];
    const counts = delimiters.map(delimiter => {
      let count = 0;
      let quoted = false;
      for (let index = 0; index < firstLine.length; index += 1) {
        if (firstLine[index] === '"') {
          if (quoted && firstLine[index + 1] === '"') index += 1;
          else quoted = !quoted;
        } else if (!quoted && firstLine[index] === delimiter) count += 1;
      }
      return count;
    });
    const delimiter = delimiters[counts.indexOf(Math.max(...counts))] || '\t';
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < cleanText.length; index += 1) {
      const character = cleanText[index];
      if (character === '"') {
        if (quoted && cleanText[index + 1] === '"') { value += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(value.trim()); value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && cleanText[index + 1] === '\n') index += 1;
        row.push(value.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = []; value = '';
      } else value += character;
    }
    row.push(value.trim());
    if (row.some(cell => cell !== '')) rows.push(row);
    const width = Math.max(0, ...rows.map(cells => cells.length));
    return rows.map(cells => Array.from({ length: width }, (_, index) => cells[index] ?? ''));
  }

  function normalize(value) {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function detectedHeaderIndex(rows) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    rows.slice(0, 12).forEach((row, index) => {
      const values = row.map(value => String(value ?? '').trim()).filter(Boolean);
      if (!values.length) return;
      const uniqueness = new Set(values.map(normalize)).size / values.length;
      const textCount = values.filter(value => Number.isNaN(Number(value)) && Number.isNaN(Date.parse(value))).length;
      const score = values.length * 2 + uniqueness * 3 + textCount / values.length * 2 - index * .1;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    return bestIndex;
  }

  function makeHeaders(values) {
    const seen = new Map();
    return values.map((value, index) => {
      const base = String(value ?? '').trim() || `Field ${index + 1}`;
      const count = (seen.get(base.toLowerCase()) || 0) + 1;
      seen.set(base.toLowerCase(), count);
      return count === 1 ? base : `${base} ${count}`;
    });
  }

  function sourceRows() {
    return state.pending?.sheets[state.pending.sheetIndex]?.rows || [];
  }

  function selectedHeaderIndex() {
    return Number(elements.headerRow.value);
  }

  function importColumns() {
    const rows = sourceRows();
    const headerIndex = selectedHeaderIndex();
    const firstDataIndex = headerIndex >= 0 ? headerIndex + 1 : 0;
    const sample = headerIndex >= 0 ? (rows[headerIndex] || []) : [];
    const width = Math.max(sample.length, ...rows.slice(firstDataIndex).map(row => row.length), 0);
    const columns = makeHeaders(Array.from({ length: width }, (_, index) => sample[index] ?? ''));
    return { columns, headerIndex, firstDataIndex, rows };
  }

  function selectedImportIndices() {
    return [...elements.columnChoices.querySelectorAll('input[type="checkbox"]')]
      .filter(input => input.checked)
      .map(input => Number(input.value));
  }

  function updateImportPreview() {
    if (!state.pending) return;
    const { columns, firstDataIndex, rows } = importColumns();
    const selected = selectedImportIndices();
    elements.selectedColumnCount.textContent = `${selected.length} of ${columns.length} fields`;
    elements.confirmImportButton.disabled = selected.length === 0;
    elements.importMessage.textContent = selected.length ? '' : 'Select at least one field.';

    const previewHead = document.createElement('tr');
    selected.forEach(index => {
      const cell = document.createElement('th');
      cell.textContent = columns[index];
      previewHead.appendChild(cell);
    });
    elements.importPreview.querySelector('thead').replaceChildren(previewHead);
    const previewBody = document.createElement('tbody');
    rows.slice(firstDataIndex, firstDataIndex + 5).forEach(row => {
      const tr = document.createElement('tr');
      selected.forEach(index => {
        const cell = document.createElement('td');
        cell.textContent = row[index] ?? '';
        tr.appendChild(cell);
      });
      previewBody.appendChild(tr);
    });
    elements.importPreview.querySelector('tbody').replaceWith(previewBody);
    const records = Math.max(0, rows.length - firstDataIndex);
    elements.previewMeta.textContent = `${records.toLocaleString()} data rows · first 5 shown`;
  }

  function renderImportOptions() {
    if (!state.pending) return;
    const sheet = state.pending.sheets[state.pending.sheetIndex];
    const autoIndex = state.pending.headerIndices[state.pending.sheetIndex] ?? detectedHeaderIndex(sheet.rows);
    elements.headerRow.replaceChildren();
    const headerOptions = Array.from({ length: Math.min(sheet.rows.length, 12) }, (_, index) => ({ value: index, label: `Row ${index + 1}` }));
    headerOptions.push({ value: -1, label: 'No header row' });
    headerOptions.forEach(option => {
      const element = document.createElement('option');
      element.value = String(option.value);
      element.textContent = option.label;
      element.selected = option.value === autoIndex;
      elements.headerRow.appendChild(element);
    });
    const { columns } = importColumns();
    elements.columnChoices.replaceChildren();
    columns.forEach((column, index) => {
      const label = document.createElement('label');
      label.className = 'column-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(index);
      checkbox.checked = true;
      const name = document.createElement('span');
      name.textContent = column;
      label.append(checkbox, name);
      elements.columnChoices.appendChild(label);
    });
    updateImportPreview();
  }

  async function decodeTextFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));

    const sampleLength = Math.min(bytes.length, 200);
    let evenNulls = 0;
    let oddNulls = 0;
    for (let index = 0; index < sampleLength; index += 1) {
      if (bytes[index] !== 0) continue;
      if (index % 2 === 0) evenNulls += 1;
      else oddNulls += 1;
    }
    if (oddNulls > sampleLength / 8) return new TextDecoder('utf-16le').decode(bytes);
    if (evenNulls > sampleLength / 8) return new TextDecoder('utf-16be').decode(bytes);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }

  function refreshDestinationOptions() {
    const hasTables = state.tables.length > 0;
    elements.appendChoice.hidden = !hasTables;
    elements.destinationTable.replaceChildren();
    state.tables.forEach(table => {
      const option = document.createElement('option');
      option.value = table.id;
      option.textContent = table.name;
      elements.destinationTable.appendChild(option);
    });
    elements.destinationTable.disabled = !hasTables || document.querySelector('input[name="destinationMode"]:checked')?.value !== 'append';
  }

  function openImport(file, sheets) {
    state.pending = { fileName: file.name, sheets, sheetIndex: 0, headerIndices: {} };
    elements.importFileName.textContent = `${file.name} · ${sheets.length} worksheet${sheets.length === 1 ? '' : 's'}`;
    elements.sourceSheet.replaceChildren();
    sheets.forEach((sheet, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = sheet.name;
      elements.sourceSheet.appendChild(option);
    });
    elements.importTableName.value = safeName(baseName(file.name), 'Imported table');
    document.querySelector('input[name="destinationMode"][value="new"]').checked = true;
    refreshDestinationOptions();
    renderImportOptions();
    elements.importDialog.showModal();
  }

  async function handleFile(file) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    if (!['txt', 'csv', 'tsv', 'xls', 'xlsx'].includes(extension)) {
      showToast('Choose a TXT, CSV, TSV, XLS, or XLSX file.');
      return;
    }
    try {
      let sheets;
      if (['xls', 'xlsx'].includes(extension)) {
        if (!window.XLSX) throw new Error('The spreadsheet library did not load. Check your connection and retry.');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        sheets = workbook.SheetNames.map(name => ({
          name,
          rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false })
            .map(row => row.map(value => String(value ?? '')))
        })).filter(sheet => sheet.rows.length);
      } else {
        const rows = parseDelimited(await decodeTextFile(file));
        sheets = rows.length ? [{ name: 'Sheet 1', rows }] : [];
      }
      if (!sheets.length) { showToast('No rows were found in that file.'); return; }
      openImport(file, sheets);
    } catch (error) {
      showToast(error.message || 'Could not read that file.');
    }
  }

  function newId() {
    return globalThis.crypto?.randomUUID?.() || `table-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createTable(name, columns, rows, source) {
    const table = {
      id: newId(), name: safeName(name, `Table ${state.tables.length + 1}`),
      columns: columns.length ? columns : ['Field 1'], rows, source, sortIndex: -1
    };
    state.tables.push(table);
    state.activeTableId = table.id;
    elements.searchInput.value = '';
    renderWorkspace();
    return table;
  }

  function appendRows(table, incomingColumns, incomingRows) {
    incomingColumns.forEach(column => {
      if (!table.columns.some(existing => normalize(existing) === normalize(column))) table.columns.push(column);
    });
    table.rows.forEach(row => { while (row.length < table.columns.length) row.push(''); });
    const targetIndices = table.columns.map(column => incomingColumns.findIndex(incoming => normalize(incoming) === normalize(column)));
    incomingRows.forEach(row => table.rows.push(targetIndices.map(index => index < 0 ? '' : (row[index] ?? ''))));
    table.source = 'Multiple sources';
    state.activeTableId = table.id;
    elements.searchInput.value = '';
    renderWorkspace();
  }

  function confirmImport() {
    if (!state.pending) return;
    const indices = selectedImportIndices();
    if (!indices.length) return;
    const { columns, firstDataIndex, rows } = importColumns();
    const selectedColumns = indices.map(index => columns[index]);
    const selectedRows = rows.slice(firstDataIndex).map(row => indices.map(index => row[index] ?? ''));
    const mode = document.querySelector('input[name="destinationMode"]:checked')?.value;
    if (mode === 'append') {
      const target = state.tables.find(table => table.id === elements.destinationTable.value);
      if (!target) { showToast('Choose a table for the imported rows.'); return; }
      appendRows(target, selectedColumns, selectedRows);
      showToast(`Added ${selectedRows.length.toLocaleString()} rows to ${target.name}.`);
    } else {
      const table = createTable(elements.importTableName.value || baseName(state.pending.fileName), selectedColumns, selectedRows, state.pending.fileName);
      showToast(`Created ${table.name} with ${selectedRows.length.toLocaleString()} rows.`);
    }
    state.pending = null;
    elements.importDialog.close();
  }

  function addEmptyTable() {
    const table = createTable(`Table ${state.tables.length + 1}`, ['Field 1'], [], 'Blank table');
    showToast(`${table.name} is ready.`);
  }

  function renderTabs() {
    elements.tableTabs.replaceChildren();
    state.tables.forEach(table => {
      const button = document.createElement('button');
      button.className = 'table-tab';
      button.type = 'button';
      button.role = 'tab';
      button.setAttribute('aria-selected', String(table.id === state.activeTableId));
      button.title = table.name;
      button.textContent = table.name;
      button.dataset.tableId = table.id;
      elements.tableTabs.appendChild(button);
    });
  }

  function updateSortOptions(table) {
    const previous = table.sortIndex;
    elements.sortColumn.replaceChildren();
    const offOption = document.createElement('option');
    offOption.value = '-1'; offOption.textContent = 'Off'; elements.sortColumn.appendChild(offOption);
    table.columns.forEach((column, index) => {
      const option = document.createElement('option');
      option.value = String(index); option.textContent = column; elements.sortColumn.appendChild(option);
    });
    if (previous >= table.columns.length) table.sortIndex = -1;
    elements.sortColumn.value = String(table.sortIndex);
  }

  function renderTable() {
    const table = activeTable();
    if (!table) return;
    const search = elements.searchInput.value.trim().toLowerCase();
    const indexedRows = table.rows.map((row, index) => ({ row, index }));
    if (table.sortIndex >= 0) {
      indexedRows.sort((first, second) => String(first.row[table.sortIndex] ?? '').localeCompare(String(second.row[table.sortIndex] ?? ''), undefined, { numeric: true, sensitivity: 'base' }));
    }
    const visibleRows = search ? indexedRows.filter(({ row }) => row.some(value => String(value ?? '').toLowerCase().includes(search))) : indexedRows;
    const head = document.createElement('tr');
    const numberHeader = document.createElement('th'); numberHeader.textContent = '#'; head.appendChild(numberHeader);
    table.columns.forEach((column, index) => {
      const th = document.createElement('th');
      const wrap = document.createElement('div'); wrap.className = 'header-edit-wrap';
      const input = document.createElement('input'); input.className = 'header-edit'; input.value = column; input.setAttribute('aria-label', `Field ${index + 1} name`); input.dataset.columnIndex = String(index);
      const remove = document.createElement('button'); remove.className = 'header-delete'; remove.type = 'button'; remove.title = `Remove ${column}`; remove.setAttribute('aria-label', `Remove field ${column}`); remove.dataset.removeColumn = String(index); remove.textContent = '×';
      wrap.append(input, remove); th.appendChild(wrap); head.appendChild(th);
    });
    const removeHeader = document.createElement('th'); removeHeader.setAttribute('aria-label', 'Remove row'); head.appendChild(removeHeader);
    elements.table.querySelector('thead').replaceChildren(head);

    const body = document.createElement('tbody');
    visibleRows.forEach(({ row, index }, displayIndex) => {
      const tr = document.createElement('tr');
      const number = document.createElement('td'); number.textContent = String(displayIndex + 1); tr.appendChild(number);
      table.columns.forEach((_, columnIndex) => {
        const td = document.createElement('td');
        const input = document.createElement('input'); input.className = 'cell-edit'; input.value = row[columnIndex] ?? ''; input.dataset.rowIndex = String(index); input.dataset.columnIndex = String(columnIndex); input.setAttribute('aria-label', `Row ${index + 1}, ${table.columns[columnIndex]}`); input.title = input.value;
        td.appendChild(input); tr.appendChild(td);
      });
      const actionCell = document.createElement('td');
      const removeRow = document.createElement('button'); removeRow.className = 'row-delete'; removeRow.type = 'button'; removeRow.title = 'Delete row'; removeRow.setAttribute('aria-label', `Delete row ${index + 1}`); removeRow.dataset.removeRow = String(index); removeRow.textContent = '×';
      actionCell.appendChild(removeRow); tr.appendChild(actionCell); body.appendChild(tr);
    });
    elements.table.querySelector('tbody').replaceWith(body);
    elements.tableMeta.textContent = `${table.columns.length} fields`;
    elements.rowStatus.textContent = search ? `${visibleRows.length} of ${table.rows.length} records` : `${table.rows.length} records`;
    elements.sourceStatus.textContent = table.source;
  }

  function renderWorkspace() {
    const hasTables = state.tables.length > 0;
    elements.tableCount.textContent = String(state.tables.length);
    elements.emptyState.hidden = hasTables;
    elements.tableEditor.hidden = !hasTables;
    elements.exportCsvButton.disabled = !hasTables;
    elements.exportXlsxButton.disabled = !hasTables;
    if (!hasTables) { elements.tableTabs.replaceChildren(); return; }
    if (!activeTable()) state.activeTableId = state.tables[0].id;
    const table = activeTable();
    renderTabs();
    elements.tableName.value = table.name;
    updateSortOptions(table);
    renderTable();
  }

  function deleteColumn(index) {
    const table = activeTable();
    if (!table || table.columns.length <= 1) { showToast('A table needs at least one field.'); return; }
    table.columns.splice(index, 1);
    table.rows.forEach(row => row.splice(index, 1));
    if (table.sortIndex === index) table.sortIndex = -1;
    else if (table.sortIndex > index) table.sortIndex -= 1;
    renderWorkspace();
  }

  function csvValue(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const table = activeTable();
    if (!table) return;
    const lines = [table.columns, ...table.rows].map(row => row.map(csvValue).join(',')).join('\r\n');
    downloadBlob(new Blob([`\uFEFF${lines}`], { type: 'text/csv;charset=utf-8' }), `${safeName(table.name, 'table')}.csv`);
    showToast(`Exported ${table.name} as CSV.`);
  }

  function exportWorkbook() {
    if (!state.tables.length) return;
    if (!window.XLSX) { showToast('The Excel library did not load. Check your connection and retry.'); return; }
    const workbook = XLSX.utils.book_new();
    const usedNames = new Set();
    state.tables.forEach((table, index) => {
      let sheetName = safeName(table.name, `Table ${index + 1}`).slice(0, 31);
      let suffix = 2;
      while (usedNames.has(sheetName.toLowerCase())) {
        const ending = ` ${suffix++}`;
        sheetName = `${safeName(table.name, `Table ${index + 1}`).slice(0, 31 - ending.length)}${ending}`;
      }
      usedNames.add(sheetName.toLowerCase());
      const worksheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows]);
      const endColumn = Math.max(0, table.columns.length - 1);
      worksheet['!cols'] = table.columns.map((column, columnIndex) => {
        const widest = Math.max(String(column).length, ...table.rows.map(row => String(row[columnIndex] ?? '').length));
        return { wch: Math.min(36, Math.max(12, widest + 2)) };
      });
      if (table.columns.length) worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.rows.length, c: endColumn } }) };
      worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
    XLSX.writeFile(workbook, 'datadesk-workbook.xlsx');
    showToast(`Exported ${state.tables.length} table${state.tables.length === 1 ? '' : 's'} to Excel.`);
  }

  elements.browseButton.addEventListener('click', () => elements.fileInput.click());
  elements.emptyImportButton.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', event => { handleFile(event.target.files[0]); event.target.value = ''; });
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fileInput.click(); } });
  elements.dropZone.addEventListener('dragover', event => { event.preventDefault(); elements.dropZone.classList.add('is-dragging'); });
  elements.dropZone.addEventListener('dragleave', event => { if (!elements.dropZone.contains(event.relatedTarget)) elements.dropZone.classList.remove('is-dragging'); });
  elements.dropZone.addEventListener('drop', event => { event.preventDefault(); elements.dropZone.classList.remove('is-dragging'); handleFile(event.dataTransfer.files[0]); });
  elements.newTableButton.addEventListener('click', addEmptyTable);
  elements.tableTabs.addEventListener('click', event => {
    const tab = event.target.closest('[data-table-id]');
    if (!tab) return;
    state.activeTableId = tab.dataset.tableId; elements.searchInput.value = ''; renderWorkspace();
  });
  elements.tableName.addEventListener('change', () => {
    const table = activeTable();
    if (!table) return;
    table.name = safeName(elements.tableName.value, 'Untitled table');
    renderWorkspace();
  });
  elements.searchInput.addEventListener('input', renderTable);
  elements.sortColumn.addEventListener('change', () => {
    const table = activeTable(); if (!table) return;
    table.sortIndex = Number(elements.sortColumn.value); renderTable();
  });
  elements.addRowButton.addEventListener('click', () => {
    const table = activeTable(); if (!table) return;
    table.rows.push(table.columns.map(() => '')); elements.searchInput.value = ''; renderWorkspace();
    const inputs = elements.table.querySelectorAll('.cell-edit');
    inputs[inputs.length - table.columns.length]?.focus();
  });
  elements.deleteTableButton.addEventListener('click', () => {
    const table = activeTable(); if (!table) return;
    if (!window.confirm(`Delete the table “${table.name}” and all its rows?`)) return;
    state.tables = state.tables.filter(item => item.id !== table.id);
    state.activeTableId = state.tables.at(-1)?.id || null;
    renderWorkspace(); showToast('Table deleted.');
  });
  elements.addColumnForm.addEventListener('submit', event => {
    event.preventDefault();
    const table = activeTable();
    const name = elements.newColumnName.value.trim();
    if (!table || !name) { elements.newColumnName.focus(); return; }
    if (table.columns.some(column => normalize(column) === normalize(name))) { showToast('That field already exists.'); return; }
    table.columns.push(name); table.rows.forEach(row => row.push('')); table.sortIndex = -1;
    elements.newColumnName.value = ''; renderWorkspace();
  });
  elements.table.addEventListener('change', event => {
    const target = event.target;
    const table = activeTable(); if (!table) return;
    if (target.matches('.cell-edit')) {
      table.rows[Number(target.dataset.rowIndex)][Number(target.dataset.columnIndex)] = target.value;
      target.title = target.value;
    } else if (target.matches('.header-edit')) {
      const index = Number(target.dataset.columnIndex);
      const name = target.value.trim();
      if (!name || table.columns.some((column, columnIndex) => columnIndex !== index && normalize(column) === normalize(name))) {
        target.value = table.columns[index]; showToast('Field names must be unique and cannot be blank.'); return;
      }
      table.columns[index] = name; renderWorkspace();
    }
  });
  elements.table.addEventListener('click', event => {
    const removeColumn = event.target.closest('[data-remove-column]');
    if (removeColumn) { deleteColumn(Number(removeColumn.dataset.removeColumn)); return; }
    const removeRow = event.target.closest('[data-remove-row]');
    if (!removeRow) return;
    const table = activeTable(); if (!table) return;
    table.rows.splice(Number(removeRow.dataset.removeRow), 1); renderWorkspace();
  });
  elements.exportCsvButton.addEventListener('click', exportCsv);
  elements.exportXlsxButton.addEventListener('click', exportWorkbook);
  elements.sourceSheet.addEventListener('change', () => {
    state.pending.headerIndices[state.pending.sheetIndex] = Number(elements.headerRow.value);
    state.pending.sheetIndex = Number(elements.sourceSheet.value); renderImportOptions();
  });
  elements.headerRow.addEventListener('change', () => {
    if (state.pending) state.pending.headerIndices[state.pending.sheetIndex] = Number(elements.headerRow.value);
    renderImportOptions();
  });
  elements.columnChoices.addEventListener('change', updateImportPreview);
  elements.selectAllFields.addEventListener('click', () => {
    elements.columnChoices.querySelectorAll('input').forEach(input => { input.checked = true; }); updateImportPreview();
  });
  elements.clearAllFields.addEventListener('click', () => {
    elements.columnChoices.querySelectorAll('input').forEach(input => { input.checked = false; }); updateImportPreview();
  });
  document.querySelectorAll('input[name="destinationMode"]').forEach(input => input.addEventListener('change', refreshDestinationOptions));
  elements.importForm.addEventListener('submit', event => { event.preventDefault(); confirmImport(); });
  elements.closeImportButton.addEventListener('click', () => { state.pending = null; elements.importDialog.close(); });
  elements.cancelImportButton.addEventListener('click', () => { state.pending = null; elements.importDialog.close(); });
  elements.importDialog.addEventListener('click', event => { if (event.target === elements.importDialog) { state.pending = null; elements.importDialog.close(); } });

  renderWorkspace();
})();
