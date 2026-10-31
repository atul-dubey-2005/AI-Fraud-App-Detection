(() => {
    'use strict';

    const page = document.body.dataset.auditPage;
    if (page !== 'history' && page !== 'reports') return;

    const isReportsPage = page === 'reports';
    const userEmail = (localStorage.getItem('userEmail') || localStorage.getItem('email') || '').trim();
    const state = { scans: [], pdfUrl: null, loading: false };

    const byId = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);

    function parseReportDetails(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch { return null; }
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const analysis = value.analysis && typeof value.analysis === 'object' ? value.analysis : {};
        const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
        const list = (items) => Array.isArray(items)
            ? items.filter((entry) => typeof entry === 'string' && entry.trim())
            : [];
        return {
            source: String(value.source || ''),
            capturedAt: value.capturedAt || null,
            metadata,
            description: String(value.description || ''),
            permissions: list(value.permissions),
            reviewSamples: Array.isArray(value.reviewSamples)
                ? value.reviewSamples.filter((review) => review && typeof review.text === 'string' && review.text.trim()).slice(0, 8)
                : [],
            analysis: {
                summary: String(analysis.summary || ''),
                riskFactors: list(analysis.riskFactors),
                recordedFindings: list(analysis.recordedFindings),
                positiveSignals: list(analysis.positiveSignals),
                reviewInsights: list(analysis.reviewInsights),
                recommendations: list(analysis.recommendations),
                confidence: String(analysis.confidence || 'Limited'),
                assessmentSource: String(analysis.assessmentSource || '')
            }
        };
    }

    function normalizeScan(item) {
        const threats = Array.isArray(item.threats)
            ? item.threats.filter((entry) => typeof entry === 'string' && entry.trim())
            : [];
        return {
            ...item,
            id: item.id == null ? '' : String(item.id),
            appName: String(item.appName || item.target || 'Unknown App'),
            target: String(item.target || ''),
            icon: String(item.icon || ''),
            riskScore: Math.max(0, Math.min(100, Number(item.riskScore) || 0)),
            status: String(item.status || 'Unknown'),
            threats,
            reportDetails: parseReportDetails(item.reportDetails),
            date: String(item.date || 'Date unavailable'),
            scannedAt: item.scannedAt || null
        };
    }

    function riskCategory(status) {
        const value = String(status || '').toLowerCase();
        if (value.includes('high') || value.includes('threat') || value.includes('malicious') || value.includes('fraud')) return 'high';
        if (value.includes('medium')) return 'medium';
        if (value.includes('safe') || value.includes('low')) return 'safe';
        return 'unknown';
    }

    function riskTone(status) {
        const category = riskCategory(status);
        if (category === 'safe') return 'text-primary border-primary/30 bg-primary/10';
        if (category === 'medium') return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
        if (category === 'high') return 'text-red-400 border-red-400/30 bg-red-400/10';
        return 'text-gray-300 border-gray-500/30 bg-gray-500/10';
    }

    function safeIconUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(value, window.location.origin);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
            return '';
        }
    }

    function getFilteredScans() {
        const queryInput = byId(isReportsPage ? 'searchInput' : 'searchHistoryInput');
        const filterInput = byId(isReportsPage ? 'reportsStatusFilter' : 'historyStatusFilter');
        const sortInput = byId(isReportsPage ? 'reportsSort' : 'historySort');
        const query = (queryInput?.value || '').trim().toLowerCase();
        const filter = filterInput?.value || 'all';
        const sort = sortInput?.value || 'newest';

        let filtered = state.scans.filter((item) => {
            const details = item.reportDetails;
            const haystack = [
                item.appName, item.target, item.status, item.date, ...item.threats,
                details?.metadata?.developer,
                details?.metadata?.category,
                ...(details?.permissions || []),
                ...(details?.analysis?.riskFactors || []),
                ...(details?.analysis?.reviewInsights || [])
            ].join(' ').toLowerCase();
            if (query && !haystack.includes(query)) return false;
            if (filter !== 'all' && riskCategory(item.status) !== filter) return false;
            return true;
        });

        const timeOf = (item) => {
            const parsed = Date.parse(item.scannedAt || item.date);
            return Number.isNaN(parsed) ? 0 : parsed;
        };

        if (sort === 'oldest') filtered.sort((a, b) => timeOf(a) - timeOf(b));
        else if (sort === 'risk-high') filtered.sort((a, b) => b.riskScore - a.riskScore);
        else if (sort === 'risk-low') filtered.sort((a, b) => a.riskScore - b.riskScore);
        else if (sort === 'name') filtered.sort((a, b) => a.appName.localeCompare(b.appName));
        else filtered.sort((a, b) => timeOf(b) - timeOf(a));

        return filtered;
    }

    function updateMetrics() {
        const totalId = isReportsPage ? 'totalReportsCount' : 'totalScansCount';
        const safeId = isReportsPage ? 'safeReportsCount' : 'safeScansCount';
        const mediumId = isReportsPage ? 'mediumReportsCount' : 'mediumScansCount';
        const highId = isReportsPage ? 'threatReportsCount' : 'threatScansCount';

        if (byId(totalId)) byId(totalId).textContent = state.scans.length;
        if (byId(safeId)) byId(safeId).textContent = state.scans.filter((item) => riskCategory(item.status) === 'safe').length;
        if (byId(mediumId)) byId(mediumId).textContent = state.scans.filter((item) => riskCategory(item.status) === 'medium').length;
        if (byId(highId)) byId(highId).textContent = state.scans.filter((item) => riskCategory(item.status) === 'high').length;

        const clearContainer = byId(isReportsPage ? 'clearReportsContainer' : 'clearHistoryContainer');
        if (clearContainer) {
            clearContainer.innerHTML = state.scans.length
                ? `<button type="button" data-action="clear-view" class="text-xs font-bold text-red-400 hover:text-white border border-red-500/30 hover:bg-red-500/20 px-3 py-2 rounded-xl transition-all">CLEAR VIEW</button>`
                : '';
        }

        const exportButton = byId('exportFilteredPdf');
        if (exportButton) exportButton.disabled = state.scans.length === 0;
    }

    function renderHistory() {
        const tbody = byId('historyTableBody');
        if (!tbody) return;

        const filtered = getFilteredScans();
        const count = byId('historyResultCount');
        if (count) count.textContent = `Showing ${filtered.length} of ${state.scans.length} saved scan${state.scans.length === 1 ? '' : 's'}.`;

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-16 text-center text-gray-500">
                <div class="flex flex-col items-center gap-2">
                    <span class="text-white font-bold">No matching history logs found</span>
                    <span class="text-xs">Try another search term or risk filter.</span>
                </div>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((item) => {
            const displayName = escapeHtml(item.appName);
            const packageId = escapeHtml(item.target || 'Package ID unavailable');
            const date = escapeHtml(item.date);
            const status = escapeHtml(item.status);
            const tone = riskTone(item.status);
            const score = escapeHtml(item.riskScore);
            const id = escapeHtml(item.id);
            return `<tr class="hover:bg-surfaceBorder/30 transition-colors">
                <td class="px-6 py-4 font-mono text-xs text-gray-400 whitespace-nowrap">${date}</td>
                <td class="px-6 py-4 text-white font-medium max-w-[300px]">
                    <div class="truncate" title="${displayName}">${displayName}</div>
                    <span class="text-[10px] font-mono text-gray-500 block truncate mt-0.5" title="${packageId}">${packageId}</span>
                </td>
                <td class="px-6 py-4 font-mono font-bold ${tone.split(' ')[0]}">${score} <span class="text-[10px] text-gray-600">/100</span></td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-bold border ${tone}">${status}</span></td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                    <button type="button" data-action="detail" data-id="${id}" class="audit-action-btn">View details</button>
                    <button type="button" data-action="hide" data-id="${id}" class="audit-action-btn audit-action-btn-danger ml-1" aria-label="Remove scan from this view">Hide</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderReports() {
        const grid = byId('reportsGrid');
        if (!grid) return;

        const filtered = getFilteredScans();
        const count = byId('reportsResultCount');
        if (count) count.textContent = `Showing ${filtered.length} of ${state.scans.length} saved report${state.scans.length === 1 ? '' : 's'}.`;

        if (!filtered.length) {
            grid.innerHTML = `<div class="col-span-full py-16 px-6 text-center bg-surface border border-surfaceBorder rounded-3xl">
                <h3 class="text-white font-bold text-lg">No matching app reports found</h3>
                <p class="text-gray-500 text-sm mt-2">Try adjusting your search or risk filter, or run a new app scan.</p>
            </div>`;
            return;
        }

        grid.innerHTML = filtered.map((item) => {
            const name = escapeHtml(item.appName);
            const target = escapeHtml(item.target || 'Package ID unavailable');
            const date = escapeHtml(item.date);
            const status = escapeHtml(item.status);
            const score = escapeHtml(item.riskScore);
            const tone = riskTone(item.status);
            const id = escapeHtml(item.id);
            const iconUrl = safeIconUrl(item.icon);
            const iconMarkup = iconUrl
                ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
                : `<span class="text-primary text-lg font-black">${escapeHtml(item.appName.trim().charAt(0).toUpperCase() || 'A')}</span>`;
            const findings = item.threats.length
                ? item.threats.slice(0, 2).map((threat) => `<li class="audit-finding">${escapeHtml(threat)}</li>`).join('')
                : `<li class="audit-finding text-gray-500">No individual findings were stored for this scan.</li>`;

            return `<article class="p-5 lg:p-6 bg-surface border border-surfaceBorder rounded-3xl flex flex-col justify-between hover:border-gray-700 transition-all shadow-xl min-w-0">
                <div>
                    <div class="flex items-start justify-between gap-3 mb-5">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="audit-card-icon">${iconMarkup}</div>
                            <div class="min-w-0">
                                <h3 class="text-white font-semibold text-sm truncate" title="${name}">${name}</h3>
                                <p class="text-[10px] text-gray-500 font-mono truncate mt-1" title="${target}">${target}</p>
                            </div>
                        </div>
                        <span class="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-bold border ${tone}">${status}</span>
                    </div>

                    <div class="flex items-end justify-between gap-3 mb-5 bg-background/50 p-4 rounded-2xl border border-gray-800/70">
                        <div>
                            <p class="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1">Risk score</p>
                            <span class="text-3xl font-black ${tone.split(' ')[0]}">${score}</span>
                            <span class="text-xs text-gray-500">/ 100</span>
                        </div>
                        <p class="text-[10px] text-gray-500 text-right">${date}</p>
                    </div>

                    <div class="mb-5">
                        <p class="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">Stored findings</p>
                        <ul class="space-y-2">${findings}</ul>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2 pt-2">
                    <button type="button" data-action="detail" data-id="${id}" class="audit-action-btn">View details</button>
                    <button type="button" data-action="preview" data-id="${id}" class="audit-action-btn">Preview PDF</button>
                    <button type="button" data-action="download" data-id="${id}" class="audit-action-btn">Download PDF</button>
                    <button type="button" data-action="hide" data-id="${id}" class="audit-action-btn audit-action-btn-danger">Hide</button>
                </div>
            </article>`;
        }).join('');
    }

    function render() {
        updateMetrics();
        if (isReportsPage) renderReports();
        else renderHistory();
    }

    function showLoadError(message) {
        const target = byId(isReportsPage ? 'reportsGrid' : 'historyTableBody');
        if (!target) return;
        const safeMessage = escapeHtml(message);
        target.innerHTML = isReportsPage
            ? `<div class="col-span-full text-red-400 text-sm p-6">${safeMessage}</div>`
            : `<tr><td colspan="5" class="text-red-400 text-sm p-6 text-center">${safeMessage}</td></tr>`;
    }

    async function loadScans() {
        if (!userEmail) {
            showLoadError('Your account email is missing. Please sign in again.');
            return;
        }

        state.loading = true;
        const refreshButton = byId('refreshAuditData');
        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = 'Loading…';
        }

        try {
            const response = await fetch(`/api/get-scans?email=${encodeURIComponent(userEmail)}`, {
                headers: { 'Accept': 'application/json' }
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Could not load saved scans.');
            }
            const migrationNotice = byId('reportDetailsMigrationNotice');
            if (migrationNotice) migrationNotice.classList.toggle('hidden', !result.reportDetailsMigrationRequired);
            state.scans = Array.isArray(result.history) ? result.history.map(normalizeScan) : [];
            render();
        } catch (error) {
            console.error('Failed to fetch saved scans:', error);
            showLoadError('Unable to load saved scans. Please refresh and try again.');
            const count = byId(isReportsPage ? 'reportsResultCount' : 'historyResultCount');
            if (count) count.textContent = 'Scan history could not be loaded.';
        } finally {
            state.loading = false;
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = 'Refresh';
            }
        }
    }

    function detailCell(label, value) {
        return `<div class="audit-detail-cell"><p class="audit-detail-label">${escapeHtml(label)}</p><p class="audit-detail-value">${escapeHtml(value || 'Not available')}</p></div>`;
    }

    function openDetails(scanId) {
        const item = state.scans.find((scan) => scan.id === String(scanId));
        if (!item) return;

        const modal = byId('auditDetailModal');
        const content = byId('auditDetailContent');
        if (!modal || !content) return;

        const tone = riskTone(item.status);
        const findings = item.threats.length
            ? item.threats.map((finding) => `<li class="audit-finding">${escapeHtml(finding)}</li>`).join('')
            : `<li class="audit-finding text-gray-500">No individual findings were stored for this scan.</li>`;

        content.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div class="min-w-0">
                    <h3 class="text-white text-xl font-bold break-words">${escapeHtml(item.appName)}</h3>
                    <p class="text-gray-500 text-xs font-mono mt-1 break-all">${escapeHtml(item.target || 'Package ID unavailable')}</p>
                </div>
                <span class="px-3 py-1.5 rounded-lg text-xs font-bold border ${tone}">${escapeHtml(item.status)}</span>
            </div>
            <div class="audit-detail-grid mb-5">
                ${detailCell('Risk score', `${item.riskScore} / 100`)}
                ${detailCell('Scan date', item.date)}
                ${detailCell('Scan record ID', item.id || 'Not available')}
                ${detailCell('Classification', item.status)}
            </div>
            <div>
                <h4 class="text-[10px] font-bold uppercase tracking-[.16em] text-gray-500 mb-3">Stored findings and analysis</h4>
                <ul class="space-y-2">${findings}</ul>
            </div>
            <p class="text-[11px] leading-relaxed text-gray-500 mt-5">This view reflects the information stored for this scan. It does not independently retest the application.</p>
        `;

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeDetails() {
        const modal = byId('auditDetailModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }

    function hideScan(scanId) {
        const item = state.scans.find((scan) => scan.id === String(scanId));
        if (!item || !confirm(`Remove "${item.appName}" from this page view? The database record will remain saved.`)) return;
        state.scans = state.scans.filter((scan) => scan.id !== item.id);
        render();
        closeDetails();
    }

    function clearCurrentView() {
        if (!state.scans.length || !confirm('Clear the scan list from this page view? Saved database records will remain unchanged.')) return;
        state.scans = [];
        render();
    }

    function getJsPdfConstructor() {
        const constructor = window.jspdf?.jsPDF || window.jsPDF;
        if (!constructor) {
            throw new Error('The PDF library did not load. Check your internet connection and refresh the Reports page.');
        }
        return constructor;
    }

    function pdfStatusColor(status) {
        const category = riskCategory(status);
        if (category === 'safe') return [0, 145, 88];
        if (category === 'medium') return [190, 125, 0];
        if (category === 'high') return [190, 45, 55];
        return [90, 100, 115];
    }

    function drawPdfPageHeader(doc, section, recordNumber, totalRecords) {
        doc.setFillColor(13, 27, 42);
        doc.rect(0, 0, 210, 34, 'F');
        doc.setTextColor(0, 230, 135);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('FRAUDSHIELD AI', 18, 13);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text(String(section).slice(0, 54), 18, 24);
        doc.setTextColor(190, 205, 218);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Record ${recordNumber} of ${totalRecords}`, 192, 24, { align: 'right' });
    }

    function startPdfPage(doc, context, section, firstPage = false) {
        if (!firstPage) doc.addPage('a4', 'portrait');
        context.section = section;
        drawPdfPageHeader(doc, section, context.recordNumber, context.totalRecords);
        return 47;
    }

    function ensurePdfSpace(doc, y, requiredHeight, context) {
        if (y + requiredHeight <= 271) return y;
        return startPdfPage(doc, context, `${context.section} — CONTINUED`);
    }

    function writePdfParagraph(doc, text, x, y, width, fontSize, lineHeight, context, color = [48, 59, 72]) {
        const content = String(text == null || text === '' ? 'Not captured in the app listing.' : text);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(content, width);
        let offset = 0;

        while (offset < lines.length) {
            if (y + lineHeight > 271) y = startPdfPage(doc, context, `${context.section} — CONTINUED`);
            const availableLines = Math.max(1, Math.floor((271 - y) / lineHeight));
            const count = Math.min(availableLines, lines.length - offset);
            doc.setTextColor(...color);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fontSize);
            doc.text(lines.slice(offset, offset + count), x, y);
            y += count * lineHeight;
            offset += count;
            if (offset < lines.length) y = startPdfPage(doc, context, `${context.section} — CONTINUED`);
        }
        return y;
    }

    function writePdfSectionTitle(doc, title, y, context) {
        y = ensurePdfSpace(doc, y, 13, context);
        doc.setTextColor(13, 27, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(String(title).toUpperCase(), 18, y);
        doc.setDrawColor(220, 226, 232);
        doc.setLineWidth(0.25);
        doc.line(18, y + 2.5, 192, y + 2.5);
        return y + 9;
    }

    function writePdfBullet(doc, text, y, context, color = [0, 160, 98]) {
        y = ensurePdfSpace(doc, y, 9, context);
        doc.setFillColor(...color);
        doc.circle(21, y - 1, 1.1, 'F');
        y = writePdfParagraph(doc, text, 27, y + 1, 162, 9, 4.5, context) + 3;
        return y;
    }

    function writePdfMetadataGrid(doc, pairs, y, context) {
        const leftX = 18;
        const rightX = 107;
        const cellWidth = 85;
        for (let index = 0; index < pairs.length; index += 2) {
            const row = pairs.slice(index, index + 2);
            const wrapped = row.map((pair) => {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                return doc.splitTextToSize(String(pair[1] || 'Not captured'), 76);
            });
            const rowHeight = Math.max(17, ...wrapped.map((lines) => 8 + lines.length * 4.1));
            y = ensurePdfSpace(doc, y, rowHeight + 3, context);

            row.forEach((pair, cellIndex) => {
                const x = cellIndex === 0 ? leftX : rightX;
                doc.setFillColor(246, 248, 250);
                doc.setDrawColor(230, 234, 238);
                doc.roundedRect(x, y - 4, cellWidth, rowHeight, 2, 2, 'FD');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(105, 116, 128);
                doc.text(String(pair[0]).toUpperCase(), x + 4, y + 1);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(35, 47, 60);
                doc.text(wrapped[cellIndex], x + 4, y + 7);
            });
            y += rowHeight + 4;
        }
        return y;
    }

    function pdfDate(value) {
        if (!value) return 'Not captured';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
    }

    function pdfValue(value, fallback = 'Not captured in listing') {
        return value === null || value === undefined || value === '' ? fallback : String(value);
    }

    function formatMetadataPairs(metadata = {}) {
        const price = metadata.free === true
            ? 'Free'
            : metadata.price != null
                ? `Paid listing (${metadata.priceCurrency || 'currency not captured'} ${metadata.price})`
                : 'Not captured';
        const yesNo = (value) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : 'Not captured';
        return [
            ['Developer / publisher', pdfValue(metadata.developer)],
            ['Google Play rating', metadata.rating != null ? `${metadata.rating} / 5` : 'Not captured'],
            ['Rating count', metadata.ratingCount != null ? Number(metadata.ratingCount).toLocaleString() : 'Not captured'],
            ['Install range', pdfValue(metadata.installs)],
            ['Minimum installs (store figure)', metadata.minInstalls != null ? Number(metadata.minInstalls).toLocaleString() : 'Not captured'],
            ['Maximum installs (store figure)', metadata.maxInstalls != null ? Number(metadata.maxInstalls).toLocaleString() : 'Not captured'],
            ['Category', pdfValue(metadata.category)],
            ['Price', price],
            ['Content rating', pdfValue(metadata.contentRating)],
            ['App version', pdfValue(metadata.version)],
            ['Android requirement', pdfValue(metadata.androidVersion)],
            ['First released', pdfValue(metadata.released)],
            ['Last updated', pdfDate(metadata.lastUpdated)],
            ['Contains ads', yesNo(metadata.containsAds)],
            ['In-app purchases', yesNo(metadata.offersInAppPurchases)],
            ['Developer website', pdfValue(metadata.developerWebsite)],
            ['Privacy policy', pdfValue(metadata.privacyPolicy)]
        ];
    }

    function drawPdfReport(doc, item, recordNumber, totalRecords, firstPage) {
        const navy = [13, 27, 42];
        const muted = [95, 108, 122];
        const light = [244, 247, 250];
        const accent = [0, 160, 98];
        const details = item.reportDetails || {};
        const metadata = details.metadata || {};
        const analysis = details.analysis || {};
        const appName = item.appName || item.target || 'Unknown App';
        const target = item.target || 'Package ID unavailable';
        const statusColor = pdfStatusColor(item.status);
        const score = Math.max(0, Math.min(100, Number(item.riskScore) || 0));
        const context = { recordNumber, totalRecords, section: 'EXECUTIVE SUMMARY' };
        let y = startPdfPage(doc, context, 'EXECUTIVE SUMMARY', firstPage);

        // Page 1: scan identity, score, summary and evidence coverage.
        doc.setTextColor(35, 47, 60);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        const titleLines = doc.splitTextToSize(appName, 174);
        doc.text(titleLines, 18, y + 5);
        y += Math.max(13, titleLines.length * 8 + 5);
        y = writePdfParagraph(doc, `Package identifier: ${target}`, 18, y, 174, 9, 4.5, context, muted) + 5;

        doc.setFillColor(...light);
        doc.roundedRect(18, y, 174, 39, 4, 4, 'F');
        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('AUTOMATED RISK SCORE', 27, y + 10);
        doc.setTextColor(...navy);
        doc.setFontSize(25);
        doc.text(String(score), 27, y + 28);
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text('/ 100', 48, y + 28);
        doc.setFillColor(...statusColor);
        doc.roundedRect(123, y + 9, 58, 10, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text(String(item.status || 'Unknown').toUpperCase(), 152, y + 15.5, { align: 'center' });
        doc.setFillColor(220, 226, 232);
        doc.roundedRect(27, y + 32, 154, 2, 1, 1, 'F');
        doc.setFillColor(...statusColor);
        doc.roundedRect(27, y + 32, Math.max(2, 154 * score / 100), 2, 1, 1, 'F');
        y += 48;

        y = writePdfSectionTitle(doc, 'Scan record', y, context);
        y = writePdfMetadataGrid(doc, [
            ['Scan date', item.date || 'Date unavailable'],
            ['Scan record ID', item.id ? `#${item.id}` : 'Not available'],
            ['Data source', details.source || 'Not stored with this scan'],
            ['Listing captured', pdfDate(details.capturedAt)]
        ], y, context);

        y = writePdfSectionTitle(doc, 'Executive assessment', y + 2, context);
        const summary = analysis.summary || (
            details.source
                ? 'No expanded AI summary was stored for this scan. Review the captured listing information and findings in the following sections.'
                : 'This is an older scan record. Only its score, classification and short findings were saved; app listing metadata and review samples were not retained at scan time.'
        );
        y = writePdfParagraph(doc, summary, 18, y, 174, 9.5, 4.8, context) + 5;
        y = writePdfParagraph(doc, `Assessment confidence: ${analysis.confidence || 'Limited / not recorded'}`, 18, y, 174, 8.5, 4.3, context, muted) + 4;
        y = writePdfParagraph(doc, `Assessment method: ${analysis.assessmentSource || 'Saved risk score and classification; expanded method details were not stored.'}`, 18, y, 174, 8.5, 4.3, context, muted);

        // App profile, Play Store metadata, description and declared permissions.
        y = startPdfPage(doc, context, 'APP PROFILE & LISTING DATA');
        y = writePdfMetadataGrid(doc, formatMetadataPairs(metadata).concat([
            ['Declared permissions captured', String((details.permissions || []).length)],
            ['Public review samples saved', String((details.reviewSamples || []).length)],
            ['Description characters captured', String((details.description || '').length)]
        ]), y, context);

        y = writePdfSectionTitle(doc, 'Store description', y + 2, context);
        y = writePdfParagraph(doc, details.description || 'The app description was not captured for this scan. Older scan records cannot recover the original description.', 18, y, 174, 8.5, 4.2, context) + 5;

        y = writePdfSectionTitle(doc, `Declared permissions (${(details.permissions || []).length})`, y, context);
        if (Array.isArray(details.permissions) && details.permissions.length) {
            details.permissions.forEach((permission) => {
                y = writePdfBullet(doc, permission, y, context, [80, 110, 145]);
            });
        } else {
            y = writePdfParagraph(doc, 'No permission list was captured in the saved listing data. This does not mean the installed app requests no permissions.', 18, y, 174, 8.5, 4.2, context, muted);
        }

        // Assessment evidence and distinctions between risk and positive signals.
        y = startPdfPage(doc, context, 'SECURITY ASSESSMENT & EVIDENCE');
        y = writePdfSectionTitle(doc, 'Risk factors recorded', y, context);
        const riskFactors = analysis.riskFactors?.length
            ? analysis.riskFactors
            : (!item.reportDetails ? item.threats : []);
        if (riskFactors && riskFactors.length) {
            riskFactors.forEach((finding) => { y = writePdfBullet(doc, finding, y, context, [190, 45, 55]); });
        } else {
            y = writePdfParagraph(doc, 'No specific risk factors were recorded by the expanded assessment. This is not a guarantee that the app is safe.', 18, y, 174, 8.5, 4.2, context, muted) + 4;
        }

        if (analysis.assessmentSource && /fallback|unavailable/i.test(analysis.assessmentSource) && analysis.recordedFindings?.length) {
            y = writePdfSectionTitle(doc, 'Scan processing notes', y + 2, context);
            analysis.recordedFindings.forEach((note) => { y = writePdfBullet(doc, note, y, context, [190, 125, 0]); });
        }

        y = writePdfSectionTitle(doc, 'Positive signals / reassuring evidence', y + 2, context);
        if (analysis.positiveSignals?.length) {
            analysis.positiveSignals.forEach((signal) => { y = writePdfBullet(doc, signal, y, context, accent); });
        } else {
            y = writePdfParagraph(doc, 'No positive signals were recorded. This is not proof that the app is unsafe; it means no separate reassuring evidence was saved.', 18, y, 174, 8.5, 4.2, context, muted) + 4;
        }

        y = writePdfSectionTitle(doc, 'Public review themes', y + 2, context);
        if (analysis.reviewInsights?.length) {
            analysis.reviewInsights.forEach((insight) => { y = writePdfBullet(doc, insight, y, context, [65, 115, 180]); });
        } else {
            y = writePdfParagraph(doc, 'No review-theme summary was stored for this scan. See the captured review samples, if available, in the next section.', 18, y, 174, 8.5, 4.2, context, muted);
        }

        // Review evidence and next steps.
        y = startPdfPage(doc, context, 'REVIEW SAMPLES & RECOMMENDATIONS');
        y = writePdfSectionTitle(doc, `Captured public review samples (${(details.reviewSamples || []).length})`, y, context);
        if (Array.isArray(details.reviewSamples) && details.reviewSamples.length) {
            details.reviewSamples.forEach((review, index) => {
                const reviewMeta = [];
                if (review.rating != null) reviewMeta.push(`Rating: ${review.rating}/5`);
                if (review.date) reviewMeta.push(`Date: ${pdfDate(review.date)}`);
                if (review.helpfulVotes != null) reviewMeta.push(`Helpful votes: ${review.helpfulVotes}`);
                y = ensurePdfSpace(doc, y, 15, context);
                doc.setFillColor(247, 249, 251);
                doc.setDrawColor(226, 232, 238);
                doc.roundedRect(18, y - 4, 174, 13, 2, 2, 'FD');
                doc.setTextColor(...navy);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text(`REVIEW SAMPLE ${index + 1}`, 23, y + 1.5);
                if (reviewMeta.length) {
                    doc.setTextColor(...muted);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.text(reviewMeta.join('  |  ').slice(0, 160), 23, y + 7);
                }
                y += 14;
                y = writePdfParagraph(doc, review.text, 23, y, 164, 8.3, 4.1, context) + 5;
            });
        } else {
            y = writePdfParagraph(doc, 'No public review text was saved with this scan. The PDF does not recreate or infer missing historical reviews.', 18, y, 174, 8.5, 4.2, context, muted) + 5;
        }

        y = writePdfSectionTitle(doc, 'Recommended next steps', y + 2, context);
        const recommendations = analysis.recommendations?.length ? analysis.recommendations : [
            'Confirm the app name, package identifier and publisher against the official Google Play listing.',
            'Review each requested permission and grant only access needed for the app to function.',
            'Check the developer website and privacy policy before sharing personal or financial information.',
            'Read recent public reviews and look for repeated, specific complaints rather than relying on one review.'
        ];
        recommendations.forEach((recommendation) => { y = writePdfBullet(doc, recommendation, y, context, accent); });

        y = writePdfSectionTitle(doc, 'Scope, limitations & interpretation', y + 2, context);
        const limitation = 'This report reflects information captured from the Google Play listing and the automated assessment at scan time. Store metadata and public reviews can change. A risk score is an assessment indicator, not a probability of fraud. This scan does not independently inspect the APK binary, execute the app, test device runtime behaviour, verify code signatures, inspect live network traffic or prove that a vulnerability exists. Missing historical fields cannot be reconstructed after the scan.';
        y = writePdfParagraph(doc, limitation, 18, y, 174, 8, 4, context, muted) + 4;
        writePdfParagraph(doc, 'Use this report as an informational aid. For high-impact decisions, perform an independent mobile application security review.', 18, y, 174, 8, 4, context, muted);
    }

    function addPdfFooters(doc) {
        const totalPages = doc.internal.getNumberOfPages();
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            doc.setPage(pageNumber);
            doc.setDrawColor(222, 228, 234);
            doc.setLineWidth(0.3);
            doc.line(18, 282, 192, 282);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(115, 125, 136);
            doc.text('FraudShield AI  |  Application risk assessment based on saved scan evidence', 18, 289);
            doc.text(`Page ${pageNumber} of ${totalPages}`, 192, 289, { align: 'right' });
        }
        if (totalPages) doc.setPage(totalPages);
    }

    function buildPdf(items) {
        const JsPDF = getJsPdfConstructor();
        const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        items.forEach((item, index) => {
            drawPdfReport(doc, item, index + 1, items.length, index === 0);
        });
        addPdfFooters(doc);
        doc.setProperties({
            title: 'FraudShield AI Detailed Application Security Reports',
            subject: 'Application metadata, saved scan assessment, permissions and public review evidence',
            author: 'FraudShield AI',
            creator: 'FraudShield AI'
        });
        return doc;
    }

    function safeFilePart(value) {
        return String(value || 'Application')
            .normalize('NFKD')
            .replace(/[^a-z0-9_-]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60) || 'Application';
    }

    function downloadPdf(items) {
        if (!items.length) {
            alert('There are no reports to export with the current filters.');
            return;
        }
        try {
            const doc = buildPdf(items);
            const label = items.length === 1 ? items[0].appName : `Filtered_Reports_${items.length}_Apps`;
            doc.save(`FraudShield_${safeFilePart(label)}.pdf`);
        } catch (error) {
            console.error('PDF generation failed:', error);
            alert(error.message || 'Could not generate the PDF report.');
        }
    }

    function previewPdf(items) {
        if (!items.length) return;
        try {
            const doc = buildPdf(items);
            const blob = doc.output('blob');
            if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
            state.pdfUrl = URL.createObjectURL(blob);

            const frame = byId('pdfPreviewFrame');
            const modal = byId('pdfPreviewModal');
            const title = byId('pdfPreviewTitle');
            if (frame && modal) {
                frame.src = state.pdfUrl;
                if (title) title.textContent = items.length === 1
                    ? `${items[0].appName} — PDF preview`
                    : `${items.length} filtered reports — PDF preview`;
                modal.classList.remove('hidden');
                modal.setAttribute('aria-hidden', 'false');
            }
        } catch (error) {
            console.error('PDF preview failed:', error);
            alert(error.message || 'Could not preview the PDF report.');
        }
    }

    function closePdfPreview() {
        const modal = byId('pdfPreviewModal');
        const frame = byId('pdfPreviewFrame');
        if (frame) frame.src = 'about:blank';
        if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (state.pdfUrl) {
            URL.revokeObjectURL(state.pdfUrl);
            state.pdfUrl = null;
        }
    }

    function initializeSidebar() {
        const menuBtn = byId('menu-btn');
        const sidebar = byId('sidebar');
        const overlay = byId('sidebar-overlay');
        if (!sidebar || !overlay) return;

        const toggleMenu = () => {
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        };
        if (menuBtn) menuBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);
        document.querySelectorAll('#sidebar nav a').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 1024 && !sidebar.classList.contains('-translate-x-full')) toggleMenu();
            });
        });
    }

    function initializeControls() {
        const search = byId(isReportsPage ? 'searchInput' : 'searchHistoryInput');
        const filter = byId(isReportsPage ? 'reportsStatusFilter' : 'historyStatusFilter');
        const sort = byId(isReportsPage ? 'reportsSort' : 'historySort');

        [search, filter, sort].forEach((control) => {
            if (!control) return;
            control.addEventListener(control === search ? 'input' : 'change', render);
        });

        const refresh = byId('refreshAuditData');
        if (refresh) refresh.addEventListener('click', loadScans);

        const exportButton = byId('exportFilteredPdf');
        if (exportButton) exportButton.addEventListener('click', () => downloadPdf(getFilteredScans()));

        document.addEventListener('click', (event) => {
            const closeDetail = event.target.closest('[data-close-detail]');
            if (closeDetail) {
                closeDetails();
                return;
            }

            const closePdf = event.target.closest('[data-close-pdf]');
            if (closePdf) {
                closePdfPreview();
                return;
            }

            const actionButton = event.target.closest('[data-action]');
            if (!actionButton) return;

            const action = actionButton.dataset.action;
            const id = actionButton.dataset.id;

            if (action === 'detail') openDetails(id);
            else if (action === 'hide') hideScan(id);
            else if (action === 'clear-view') clearCurrentView();
            else if (action === 'preview') {
                const item = state.scans.find((scan) => scan.id === String(id));
                if (item) previewPdf([item]);
            } else if (action === 'download') {
                const item = state.scans.find((scan) => scan.id === String(id));
                if (item) downloadPdf([item]);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeDetails();
                closePdfPreview();
            }
        });
    }

    initializeSidebar();
    initializeControls();
    loadScans();
})();
