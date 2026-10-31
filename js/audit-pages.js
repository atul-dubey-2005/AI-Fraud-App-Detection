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
            const haystack = [
                item.appName, item.target, item.status, item.date, ...item.threats
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

    function pdfText(doc, text, x, y, width, fontSize = 10, lineHeight = 5) {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(String(text || ''), width);
        doc.text(lines, x, y);
        return y + (lines.length * lineHeight);
    }

    function pdfStatusColor(status) {
        const category = riskCategory(status);
        if (category === 'safe') return [0, 145, 88];
        if (category === 'medium') return [190, 125, 0];
        if (category === 'high') return [190, 45, 55];
        return [90, 100, 115];
    }

    function addPdfFooter(doc, pageNumber, totalPages) {
        doc.setDrawColor(222, 228, 234);
        doc.setLineWidth(0.3);
        doc.line(18, 282, 192, 282);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(115, 125, 136);
        doc.text('FraudShield AI  |  Automated application risk assessment', 18, 289);
        doc.text(`Page ${pageNumber} of ${totalPages}`, 192, 289, { align: 'right' });
    }

    function drawPdfPageHeader(doc, section, recordNumber, totalRecords) {
        doc.setFillColor(13, 27, 42);
        doc.rect(0, 0, 210, 34, 'F');
        doc.setTextColor(0, 230, 135);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('FRAUDSHIELD AI', 18, 13);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(15);
        doc.text(section, 18, 24);
        doc.setTextColor(190, 205, 218);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`Record ${recordNumber} of ${totalRecords}`, 192, 24, { align: 'right' });
    }

    function drawPdfReport(doc, item, recordNumber, totalRecords, startPage, totalPages) {
        const navy = [13, 27, 42];
        const muted = [95, 108, 122];
        const light = [244, 247, 250];
        const accent = [0, 160, 98];
        const appName = item.appName || item.target || 'Unknown App';
        const target = item.target || 'Package ID unavailable';
        const statusColor = pdfStatusColor(item.status);
        const score = Math.max(0, Math.min(100, Number(item.riskScore) || 0));

        // Page 1: executive summary and scan metadata.
        if (startPage > 1) doc.addPage('a4', 'portrait');
        drawPdfPageHeader(doc, 'APPLICATION SECURITY REPORT', recordNumber, totalRecords);

        doc.setTextColor(35, 47, 60);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        const titleLines = doc.splitTextToSize(appName, 174);
        doc.text(titleLines, 18, 53);
        let y = 53 + (titleLines.length * 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text('Package identifier', 18, y + 1);
        y = pdfText(doc, target, 18, y + 7, 174, 9, 4.5) + 7;

        doc.setFillColor(...light);
        doc.roundedRect(18, y, 174, 42, 4, 4, 'F');
        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('RISK SCORE', 27, y + 11);
        doc.setTextColor(...navy);
        doc.setFontSize(27);
        doc.text(String(score), 27, y + 30);
        doc.setFontSize(10);
        doc.setTextColor(...muted);
        doc.text('/ 100', 47, y + 30);
        doc.setFillColor(...statusColor);
        doc.roundedRect(126, y + 10, 55, 10, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text(String(item.status || 'Unknown').toUpperCase(), 153.5, y + 16.5, { align: 'center' });

        doc.setFillColor(220, 226, 232);
        doc.roundedRect(27, y + 34, 154, 2.5, 1, 1, 'F');
        doc.setFillColor(...statusColor);
        doc.roundedRect(27, y + 34, Math.max(2, 154 * score / 100), 2.5, 1, 1, 'F');
        y += 55;

        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('SCAN DETAILS', 18, y);
        y += 8;

        const details = [
            ['Scan date', item.date || 'Date unavailable'],
            ['Record ID', item.id ? `#${item.id}` : 'Not available'],
            ['Classification', item.status || 'Unknown'],
            ['Report generated', new Date().toLocaleString()]
        ];
        details.forEach(([label, value], index) => {
            const rowY = y + index * 13;
            doc.setDrawColor(230, 234, 238);
            doc.line(18, rowY + 4, 192, rowY + 4);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...muted);
            doc.text(label, 20, rowY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(45, 55, 67);
            doc.text(doc.splitTextToSize(String(value), 105), 82, rowY);
        });
        y += 66;

        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('EXECUTIVE SUMMARY', 18, y);
        y += 8;
        doc.setFillColor(247, 249, 251);
        doc.roundedRect(18, y - 4, 174, 36, 3, 3, 'F');
        const summary = `The saved FraudShield scan classified ${appName} as ${item.status || 'Unknown'} with a risk score of ${score} out of 100. Review the recorded findings and the assessment limitations on the following page before making an installation or security decision.`;
        doc.setTextColor(55, 65, 78);
        const summaryLines = doc.splitTextToSize(summary, 158);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(summaryLines, 26, y + 5);

        addPdfFooter(doc, startPage, totalPages);

        // Page 2: findings, practical next steps and assessment limitations.
        doc.addPage('a4', 'portrait');
        drawPdfPageHeader(doc, 'FINDINGS & RECOMMENDATIONS', recordNumber, totalRecords);
        y = 50;

        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('RECORDED FINDINGS', 18, y);
        y += 9;

        const findings = item.threats.length
            ? item.threats
            : ['No individual findings were stored in this scan record.'];
        findings.forEach((finding, index) => {
            const lines = doc.splitTextToSize(`${index + 1}. ${finding}`, 158);
            const boxHeight = Math.max(17, 9 + lines.length * 5);
            doc.setFillColor(247, 249, 251);
            doc.setDrawColor(226, 232, 238);
            doc.roundedRect(18, y - 5, 174, boxHeight, 3, 3, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(48, 59, 72);
            doc.text(lines, 26, y + 3);
            y += boxHeight + 5;
        });

        y += 3;
        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('GENERAL NEXT STEPS', 18, y);
        y += 9;

        const recommendations = [
            'Confirm the application name, package identifier and publisher against its official store listing.',
            'Review requested permissions and grant only the access needed for the app to work.',
            'Do not share passwords, banking credentials or one-time passwords with an app or person you do not trust.'
        ];
        recommendations.forEach((recommendation, index) => {
            doc.setFillColor(...accent);
            doc.circle(21, y - 1, 1.4, 'F');
            y = pdfText(doc, recommendation, 27, y + 1, 162, 9, 4.7) + 5;
        });

        y += 2;
        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('ASSESSMENT SCOPE & LIMITATIONS', 18, y);
        y += 7;
        const limitation = 'This PDF is generated from the scan record stored by FraudShield AI. It reports the saved score, classification and findings only. It does not independently retest the application, inspect live network traffic, verify the publisher, or certify that the application is safe or malicious.';
        y = pdfText(doc, limitation, 18, y, 174, 8.5, 4.4);

        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.text('Use this report as an informational aid, not as a substitute for an independent security review.', 18, Math.min(274, y + 8));

        addPdfFooter(doc, startPage + 1, totalPages);
    }

    function buildPdf(items) {
        const JsPDF = getJsPdfConstructor();
        const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const totalPages = items.length * 2;
        items.forEach((item, index) => {
            const firstPage = index * 2 + 1;
            drawPdfReport(doc, item, index + 1, items.length, firstPage, totalPages);
        });
        doc.setProperties({
            title: 'FraudShield AI Application Security Reports',
            subject: 'Saved application scan assessments',
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
