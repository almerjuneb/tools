(() => {
	'use strict';

	const EXPECTED_HEADERS = ['IDNow ID', 'ID NUMBER', 'NAME', 'Last Printed', 'Date Created'];
	const RECOGNIZABLE_HEADERS = new Set(['idnowid', 'idnumber', 'name', 'course', 'nameofguardian', 'guardianname', 'address', 'contactnumber', 'contactno', 'phonenumber', 'phone', 'lastprinted', 'datecreated']);
	const state = { rows: [], headers: [], exportColumns: new Set(), fileName: '', sort: 'desc', query: '', printIndex: -1 };
	const elements = {
		fileInput: document.getElementById('fileInput'), dropZone: document.getElementById('dropZone'), browseButton: document.getElementById('browseButton'),
		sampleButton: document.getElementById('sampleButton'), removeFile: document.getElementById('removeFile'), fileNotice: document.getElementById('fileNotice'),
		fileName: document.getElementById('fileName'), fileMeta: document.getElementById('fileMeta'), formatToggle: document.getElementById('formatToggle'),
		formatDetails: document.getElementById('formatDetails'), exportButton: document.getElementById('exportButton'), columnPicker: document.getElementById('columnPicker'),
		columnOptions: document.getElementById('columnOptions'), columnCount: document.getElementById('columnCount'), selectAllColumns: document.getElementById('selectAllColumns'),
		clearColumns: document.getElementById('clearColumns'), totalCount: document.getElementById('totalCount'),
		recentCount: document.getElementById('recentCount'), latestDate: document.getElementById('latestDate'), visibleCount: document.getElementById('visibleCount'),
		searchInput: document.getElementById('searchInput'), sortSelect: document.getElementById('sortSelect'), emptyState: document.getElementById('emptyState'),
		tableWrap: document.getElementById('tableWrap'), table: document.getElementById('dataTable'), noResults: document.getElementById('noResults'),
		footerText: document.getElementById('footerText'), toast: document.getElementById('toast')
	};
	let toastTimer;

	function showToast(message) {
		elements.toast.textContent = message;
		elements.toast.classList.add('is-visible');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3200);
	}

	function parseDelimited(text) {
		const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
		if (!lines.length) return [];
		const firstLine = lines.find(line => line.trim());
		const separators = ['\t', ',', ';', '|'];
		const delimiter = separators.reduce((best, candidate) => {
			const count = (firstLine.match(new RegExp(candidate === '\t' ? '\\t' : `\\${candidate}`, 'g')) || []).length;
			return count > best.count ? { value: candidate, count } : best;
		}, { value: '\t', count: 0 }).value;

		return lines.map(line => {
			const cells = [];
			let value = '';
			let quoted = false;
			for (let index = 0; index < line.length; index += 1) {
				const character = line[index];
				if (character === '"') {
					if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
					else quoted = !quoted;
				} else if (character === delimiter && !quoted) {
					cells.push(value.trim()); value = '';
				} else value += character;
			}
			cells.push(value.trim());
			return cells;
		}).filter(cells => cells.some(cell => cell !== ''));
	}

	function normalizeHeader(value) {
		return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	function isHeaderRow(cells) {
		const normalized = cells.map(normalizeHeader);
		return normalized.filter(cell => RECOGNIZABLE_HEADERS.has(cell)).length >= 2;
	}

	function parseDate(value) {
		if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
		const text = String(value ?? '').trim();
		if (!text) return null;
		const match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
		if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
		const parsed = new Date(text);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function dateValue(row) {
		return state.printIndex >= 0 ? parseDate(row[state.printIndex]) : null;
	}

	function activityClass(date) {
		if (!date) return 'unknown';
		const ageDays = (Date.now() - date.getTime()) / 86400000;
		if (ageDays < 7) return 'fresh';
		if (ageDays < 30) return 'warm';
		return 'stale';
	}

	function formatDate(date) {
		return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
	}

	function escapeHtml(value) {
		return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
	}

	function identifyPrintColumn(headers) {
		const index = headers.findIndex(header => normalizeHeader(header).includes('lastprinted'));
		if (index >= 0) return index;
		return headers.findIndex(header => /printed/i.test(header));
	}

	function updateColumnSelection() {
		const selectedCount = state.exportColumns.size;
		elements.columnCount.textContent = `${selectedCount} of ${state.headers.length} selected`;
		elements.exportButton.disabled = state.rows.length === 0 || selectedCount === 0;
	}

	function renderColumnPicker() {
		elements.columnOptions.replaceChildren();
		state.headers.forEach((header, index) => {
			const label = document.createElement('label');
			label.className = 'column-option';
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = state.exportColumns.has(index);
			checkbox.dataset.columnIndex = String(index);
			const name = document.createElement('span');
			name.textContent = header;
			label.append(checkbox, name);
			elements.columnOptions.appendChild(label);
		});
		elements.columnPicker.hidden = state.headers.length === 0;
		updateColumnSelection();
	}

	function setDataset(headers, rows, fileName) {
		state.headers = headers;
		state.rows = rows;
		state.exportColumns = new Set(headers.map((_, index) => index));
		state.fileName = fileName;
		state.printIndex = identifyPrintColumn(headers);
		elements.fileName.textContent = fileName;
		elements.fileMeta.textContent = `${rows.length.toLocaleString()} ${rows.length === 1 ? 'record' : 'records'} detected`;
		elements.fileNotice.hidden = false;
		elements.dropZone.hidden = true;
		elements.exportButton.disabled = rows.length === 0;
		elements.searchInput.disabled = rows.length === 0;
		elements.sortSelect.disabled = rows.length === 0;
		elements.searchInput.value = '';
		state.query = '';
		renderColumnPicker();
		render();
	}

	function processText(text, name) {
		const parsed = parseDelimited(text);
		if (!parsed.length) { showToast('This file does not contain any data.'); return; }
		let headers;
		let rows;
		if (isHeaderRow(parsed[0])) {
			headers = parsed[0].map((header, index) => header || `Column ${index + 1}`);
			rows = parsed.slice(1);
		} else {
			headers = [...EXPECTED_HEADERS];
			rows = parsed;
			if (rows.some(row => row.length > headers.length)) {
				headers = headers.concat(Array.from({ length: Math.max(...rows.map(row => row.length)) - headers.length }, (_, index) => `Extra column ${index + 1}`));
			}
		}
		const width = Math.max(headers.length, ...rows.map(row => row.length));
		if (width > headers.length) headers = headers.concat(Array.from({ length: width - headers.length }, (_, index) => `Column ${headers.length + index + 1}`));
		rows = rows.filter(row => row.some(cell => cell !== '')).map(row => Array.from({ length: headers.length }, (_, index) => row[index] ?? ''));
		if (!rows.length) { showToast('The file contains headers but no data rows.'); return; }
		setDataset(headers, rows, name);
		if (identifyPrintColumn(headers) < 0) showToast('Imported data. No “Last Printed” column was found, so date sorting is unavailable.');
		else showToast(`${rows.length.toLocaleString()} records imported and sorted by print date.`);
	}

	function decodeTextFile(buffer) {
		const bytes = new Uint8Array(buffer);
		if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
		if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
		if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));

		// Some Windows text exports are UTF-16 without a byte-order mark.
		const sampleLength = Math.min(bytes.length, 200);
		let evenNulls = 0;
		let oddNulls = 0;
		for (let index = 0; index < sampleLength; index += 1) {
			if (bytes[index] === 0) {
				if (index % 2 === 0) evenNulls += 1;
				else oddNulls += 1;
			}
		}
		if (oddNulls > sampleLength / 8) return new TextDecoder('utf-16le').decode(bytes);
		if (evenNulls > sampleLength / 8) return new TextDecoder('utf-16be').decode(bytes);

		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			// Legacy ANSI/Windows-1252 files often contain characters such as Ñ.
			return new TextDecoder('windows-1252').decode(bytes);
		}
	}

	function handleFile(file) {
		if (!file) return;
		if (!/\.(txt|tsv|csv)$/i.test(file.name) && !/^text\//.test(file.type)) {
			showToast('Please choose a .txt, .tsv, or .csv file.');
			return;
		}
		if (file.size > 10 * 1024 * 1024) { showToast('That file is over the 10 MB limit.'); return; }
		const reader = new FileReader();
		reader.onload = () => processText(decodeTextFile(reader.result), file.name);
		reader.onerror = () => showToast('The file could not be read. Please try again.');
		reader.readAsArrayBuffer(file);
	}

	function sortedRows() {
		const rows = [...state.rows];
		if (state.printIndex < 0) return rows;
		return rows.sort((a, b) => {
			const aDate = dateValue(a); const bDate = dateValue(b);
			if (!aDate && !bDate) return 0;
			if (!aDate) return 1;
			if (!bDate) return -1;
			return state.sort === 'desc' ? bDate - aDate : aDate - bDate;
		});
	}

	function render() {
		const allSorted = sortedRows();
		const now = Date.now();
		const weekAgo = now - 7 * 86400000;
		const datedRows = state.rows.map(dateValue).filter(Boolean);
		const recent = datedRows.filter(date => date.getTime() >= weekAgo && date.getTime() <= now).length;
		const latest = datedRows.length ? new Date(Math.max(...datedRows.map(date => date.getTime()))) : null;
		elements.totalCount.textContent = state.rows.length.toLocaleString();
		elements.recentCount.textContent = recent.toLocaleString();
		elements.latestDate.textContent = latest ? formatDate(latest) : '—';
		elements.emptyState.hidden = state.rows.length > 0;
		elements.tableWrap.hidden = state.rows.length === 0;
		elements.noResults.hidden = true;
		if (!state.rows.length) {
			elements.visibleCount.textContent = '0 rows';
			elements.footerText.textContent = 'Waiting for a file';
			elements.table.querySelector('thead').replaceChildren();
			elements.table.querySelector('tbody').replaceChildren();
			return;
		}

		const query = state.query.trim().toLowerCase();
		const filtered = query ? allSorted.filter(row => row.some(value => String(value).toLowerCase().includes(query))) : allSorted;
		elements.visibleCount.textContent = `${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'row' : 'rows'}`;
		elements.footerText.textContent = query ? `Showing ${filtered.length.toLocaleString()} of ${state.rows.length.toLocaleString()} records` : `${state.fileName} · ${state.rows.length.toLocaleString()} records`;
		elements.noResults.hidden = filtered.length > 0;
		elements.tableWrap.hidden = filtered.length === 0;

		const head = elements.table.querySelector('thead');
		const headerRow = document.createElement('tr');
		state.headers.forEach(header => { const th = document.createElement('th'); th.textContent = header; headerRow.appendChild(th); });
		head.replaceChildren(headerRow);
		const body = document.createElement('tbody');
		filtered.forEach(row => {
			const tr = document.createElement('tr');
			row.forEach((value, index) => {
				const td = document.createElement('td');
				if (index === state.printIndex) {
					td.className = 'date-cell';
					const date = parseDate(value);
					const chip = document.createElement('span');
					chip.className = `date-chip ${activityClass(date)}`;
					chip.textContent = value || 'Not printed';
					td.appendChild(chip);
				} else td.textContent = value;
				tr.appendChild(td);
			});
			body.appendChild(tr);
		});
		elements.table.querySelector('tbody').replaceWith(body);
	}

	function exportWorkbook() {
		if (!state.rows.length) return;
		if (!window.XLSX) { showToast('Excel export library did not load. Check your internet connection and reload.'); return; }
		const selectedColumns = state.headers.map((_, index) => index).filter(index => state.exportColumns.has(index));
		if (!selectedColumns.length) { showToast('Select at least one column to export.'); return; }
		const headers = selectedColumns.map(index => state.headers[index]);
		const rows = sortedRows().map(row => selectedColumns.map(index => row[index] ?? ''));
		const printExportIndex = selectedColumns.indexOf(state.printIndex);
		const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
		const headerColors = ['35547D', '49688F', '4B7180', '74664F', '526883'];
		const range = XLSX.utils.decode_range(worksheet['!ref']);
		worksheet['!cols'] = headers.map((header, column) => {
			const maxLength = Math.max(String(header).length, ...rows.map(row => String(row[column] ?? '').length));
			return { wch: Math.min(Math.max(maxLength + 3, 13), 34) };
		});
		worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
		worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
		for (let column = 0; column <= range.e.c; column += 1) {
			const address = XLSX.utils.encode_cell({ r: 0, c: column });
			if (worksheet[address]) worksheet[address].s = { fill: { patternType: 'solid', fgColor: { rgb: headerColors[column % headerColors.length] } }, font: { bold: true, color: { rgb: 'FFFFFF' }, name: 'Aptos', sz: 11 }, alignment: { vertical: 'center' }, border: { bottom: { style: 'medium', color: { rgb: '243C5C' } } } };
		}
		for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
			for (let column = 0; column <= range.e.c; column += 1) {
				const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
				const cell = worksheet[address];
				if (!cell) continue;
				const fill = rowIndex % 2 === 0 ? 'F5F8FC' : 'FFFFFF';
				cell.s = { fill: { patternType: 'solid', fgColor: { rgb: fill } }, font: { name: 'Aptos', color: { rgb: '334155' }, sz: 10 }, alignment: { vertical: 'center' }, border: { bottom: { style: 'thin', color: { rgb: 'E7ECF2' } } } };
				if (column === printExportIndex) {
					const activity = activityClass(parseDate(cell.v));
					const colors = { fresh: ['E9F7F0', '21845F'], warm: ['FFF4DF', 'A7711D'], stale: ['FDEDEC', 'BB514B'], unknown: ['F0F2F5', '6B7280'] }[activity];
					cell.s.fill.fgColor.rgb = colors[0];
					cell.s.font.color.rgb = colors[1];
					cell.s.font.bold = true;
				}
			}
		}
		worksheet['!rows'] = [{ hpt: 25 }, ...rows.map(() => ({ hpt: 21 }))];
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
		const baseName = (state.fileName || 'records').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-');
		XLSX.writeFile(workbook, `${baseName}-formatted.xlsx`);
		showToast(`Exported ${rows.length.toLocaleString()} formatted records to Excel.`);
	}

	elements.browseButton.addEventListener('click', event => { event.stopPropagation(); elements.fileInput.click(); });
	elements.dropZone.addEventListener('click', event => { if (event.target.closest('button')) return; elements.fileInput.click(); });
	elements.dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fileInput.click(); } });
	elements.fileInput.addEventListener('change', event => { handleFile(event.target.files[0]); event.target.value = ''; });
	elements.sampleButton.addEventListener('click', () => {
		const sample = [
			EXPECTED_HEADERS,
			['5', '123123', 'Sample Name.', '17/09/2026 11:03:19', '25/07/2023 13:44:34'],
			['8', '458921', 'Jordan Lee', '02/10/2026 09:24:08', '12/05/2024 08:12:10'],
			['3', '771204', 'Morgan Chen', '28/09/2026 14:45:31', '19/11/2022 16:30:00'],
			['11', '349876', 'Avery Patel', '21/09/2026 10:02:17', '04/02/2025 11:05:44'],
			['2', '902115', 'Casey Rivera', '14/08/2026 16:18:02', '30/06/2021 09:15:26'],
			['14', '611038', 'Taylor Kim', '03/07/2026 12:32:55', '17/03/2024 13:40:08'],
			['6', '285430', 'Riley Brooks', '10/03/2026 08:47:16', '08/12/2020 10:22:32'],
			['9', '537290', 'Jamie Wilson', '05/01/2026 15:06:41', '21/08/2023 14:18:05']
		];
		processText(sample.map(row => row.join('\t')).join('\n'), 'sample-records.txt');
	});
	elements.columnOptions.addEventListener('change', event => {
		const checkbox = event.target.closest('input[data-column-index]');
		if (!checkbox) return;
		const index = Number(checkbox.dataset.columnIndex);
		if (checkbox.checked) state.exportColumns.add(index);
		else state.exportColumns.delete(index);
		updateColumnSelection();
	});
	elements.selectAllColumns.addEventListener('click', () => {
		state.exportColumns = new Set(state.headers.map((_, index) => index));
		renderColumnPicker();
	});
	elements.clearColumns.addEventListener('click', () => {
		state.exportColumns.clear();
		renderColumnPicker();
	});
	elements.removeFile.addEventListener('click', () => {
		state.rows = []; state.headers = []; state.exportColumns.clear(); state.fileName = ''; state.printIndex = -1;
		elements.fileNotice.hidden = true; elements.dropZone.hidden = false; elements.exportButton.disabled = true;
		elements.columnPicker.hidden = true; elements.columnOptions.replaceChildren(); elements.columnCount.textContent = '';
		elements.searchInput.disabled = true; elements.sortSelect.disabled = true; elements.searchInput.value = ''; state.query = '';
		render(); showToast('File removed. You can import another one.');
	});
	elements.formatToggle.addEventListener('click', () => {
		const expanded = elements.formatToggle.getAttribute('aria-expanded') === 'true';
		elements.formatToggle.setAttribute('aria-expanded', String(!expanded));
		elements.formatDetails.hidden = expanded;
		elements.formatToggle.innerHTML = expanded ? 'See expected columns <span>⌄</span>' : 'Hide expected columns <span>⌃</span>';
	});
	elements.searchInput.addEventListener('input', event => { state.query = event.target.value; render(); });
	elements.sortSelect.addEventListener('change', event => { state.sort = event.target.value; render(); });
	elements.exportButton.addEventListener('click', exportWorkbook);
	elements.dropZone.addEventListener('dragover', event => { event.preventDefault(); elements.dropZone.classList.add('is-dragging'); });
	elements.dropZone.addEventListener('dragleave', event => { if (!elements.dropZone.contains(event.relatedTarget)) elements.dropZone.classList.remove('is-dragging'); });
	elements.dropZone.addEventListener('drop', event => { event.preventDefault(); elements.dropZone.classList.remove('is-dragging'); handleFile(event.dataTransfer.files[0]); });
	document.addEventListener('keydown', event => {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !elements.searchInput.disabled) {
			event.preventDefault(); elements.searchInput.focus();
		}
	});
})();
