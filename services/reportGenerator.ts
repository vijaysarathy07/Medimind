import * as Print from 'expo-print';
import type { WeeklyReport, DayStats, MedicineStats } from './reportService';

// ─── public API ──────────────────────────────────────────────

/** Renders the report as HTML, passes it through expo-print, returns the file:// URI. */
export async function generatePDF(report: WeeklyReport): Promise<string> {
  const html = buildHTML(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

// ─── colour helpers ──────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct >= 80) return '#1D9E75';
  if (pct >= 50) return '#F57C00';
  return '#E53935';
}

function statBox(value: number | string, label: string, bg: string, textColor: string): string {
  return `
    <td style="width:25%;padding:14px 8px;background:${bg};border-radius:8px;text-align:center;vertical-align:top;">
      <div style="font-size:30px;font-weight:800;color:${textColor};line-height:1.1;">${value}</div>
      <div style="font-size:9px;color:#6B8178;margin-top:5px;text-transform:uppercase;letter-spacing:0.6px;">${label}</div>
    </td>`;
}

// ─── sub-templates ───────────────────────────────────────────

function renderDayBars(days: DayStats[]): string {
  const bars = days.map((d) => {
    const barH  = d.scheduled > 0 ? Math.round((d.adherence / 100) * 110) : 2;
    const color = d.scheduled === 0 ? '#E8EEE8' : pctColor(d.adherence);
    return `
      <div style="flex:1;display:flex;align-items:flex-end;justify-content:center;padding:0 2px;">
        <div style="width:100%;height:${barH}px;background:${color};border-radius:4px 4px 0 0;min-height:2px;"></div>
      </div>`;
  }).join('');

  const labels = days.map((d) =>
    `<div style="flex:1;text-align:center;font-size:10px;font-weight:700;color:#1A2E26;padding-top:5px;">${d.dayLabel}</div>`
  ).join('');

  const pcts = days.map((d) =>
    `<div style="flex:1;text-align:center;font-size:9px;color:#6B8178;padding-top:2px;">
      ${d.scheduled > 0 ? `${d.adherence}%` : '–'}
    </div>`
  ).join('');

  const dates = days.map((d) =>
    `<div style="flex:1;text-align:center;font-size:8px;color:#A0B4AC;">${d.dateLabel}</div>`
  ).join('');

  return `
    <div style="background:#F8FAF9;border-radius:10px;padding:16px;">
      <!-- bars -->
      <div style="display:flex;align-items:flex-end;height:110px;border-bottom:2px solid #E8EEE8;gap:4px;">
        ${bars}
      </div>
      <!-- labels -->
      <div style="display:flex;gap:4px;margin-top:0;">${labels}</div>
      <div style="display:flex;gap:4px;">${pcts}</div>
      <div style="display:flex;gap:4px;margin-top:1px;">${dates}</div>
    </div>`;
}

function renderMedicineRows(medicines: MedicineStats[]): string {
  if (medicines.length === 0) {
    return `<tr><td colspan="7" style="padding:16px;text-align:center;color:#A0B4AC;font-style:italic;">
      No medicines recorded in this period.
    </td></tr>`;
  }

  return medicines.map((m, i) => {
    const bg       = i % 2 === 0 ? '#ffffff' : '#F8FAF9';
    const adhColor = pctColor(m.adherence);
    return `
      <tr style="background:${bg};">
        <td style="padding:10px 12px;border-right:1px solid #E8EEE8;">
          <div style="font-weight:700;color:#1A2E26;font-size:12px;">${m.name}</div>
          <div style="color:#6B8178;font-size:10px;margin-top:1px;">${m.dosage}</div>
        </td>
        <td style="padding:10px 8px;text-align:center;color:#6B8178;font-size:10px;border-right:1px solid #E8EEE8;">
          ${m.frequency}
        </td>
        <td style="padding:10px 8px;text-align:center;font-weight:700;font-size:13px;border-right:1px solid #E8EEE8;">
          ${m.scheduled}
        </td>
        <td style="padding:10px 8px;text-align:center;color:#1D9E75;font-weight:700;font-size:13px;border-right:1px solid #E8EEE8;">
          ${m.taken}
        </td>
        <td style="padding:10px 8px;text-align:center;color:#E53935;font-size:13px;border-right:1px solid #E8EEE8;">
          ${m.missed}
        </td>
        <td style="padding:10px 8px;text-align:center;color:#F57C00;font-size:13px;border-right:1px solid #E8EEE8;">
          ${m.skipped}
        </td>
        <td style="padding:10px 8px;text-align:center;">
          <span style="display:inline-block;background:${adhColor};color:white;padding:3px 10px;
            border-radius:12px;font-size:11px;font-weight:800;letter-spacing:0.2px;">
            ${m.adherence}%
          </span>
        </td>
      </tr>`;
  }).join('');
}

// ─── main HTML builder ───────────────────────────────────────

function buildHTML(r: WeeklyReport): string {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtShort = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const overallColor  = pctColor(r.overallAdherence);
  const barFillWidth  = `${r.overallAdherence}%`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    color: #1A2E26;
    background: #ffffff;
    padding: 36px 40px;
    font-size: 12px;
    line-height: 1.5;
    max-width: 680px;
  }
  .section { margin-bottom: 26px; }
  .section-label {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    color: #6B8178;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #1D9E75;
    display: inline-block;
  }
  table { border-collapse: collapse; }
</style>
</head>
<body>

<!-- ═══ HEADER ══════════════════════════════════════════════ -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;
  margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #1D9E75;">
  <div>
    <div style="font-size:22px;font-weight:900;color:#1D9E75;letter-spacing:-0.5px;">💊 MediMind</div>
    <div style="font-size:13px;color:#6B8178;margin-top:3px;font-weight:600;">Medication Adherence Report</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:15px;font-weight:800;color:#1A2E26;">${r.patientName}</div>
    <div style="font-size:11px;color:#6B8178;margin-top:3px;">
      ${fmtShort(r.startDate)} – ${fmtShort(r.endDate)}, ${r.endDate.getFullYear()}
    </div>
    <div style="font-size:9px;color:#A0B4AC;margin-top:2px;">Generated ${fmtDate(new Date())}</div>
  </div>
</div>

<!-- ═══ SUMMARY ═════════════════════════════════════════════ -->
<div class="section">
  <div class="section-label">Weekly Summary</div>

  <!-- Stat boxes -->
  <table width="100%" style="margin-bottom:14px;">
    <tr>
      ${statBox(r.totalScheduled, 'Scheduled',  '#F8FAF9', '#1A2E26')}
      <td style="width:10px;"></td>
      ${statBox(r.totalTaken,    'Taken',      '#E8F5F0', '#1D9E75')}
      <td style="width:10px;"></td>
      ${statBox(r.totalMissed,   'Missed',     '#FFF5F5', '#E53935')}
      <td style="width:10px;"></td>
      ${statBox(r.totalSkipped,  'Skipped',    '#FFF8F0', '#F57C00')}
    </tr>
  </table>

  <!-- Overall adherence bar -->
  <div style="display:flex;align-items:center;gap:20px;padding:16px 18px;
    background:#F8FAF9;border-radius:10px;border-left:5px solid ${overallColor};">
    <div style="font-size:44px;font-weight:900;color:${overallColor};line-height:1;min-width:90px;text-align:center;">
      ${r.overallAdherence}%
    </div>
    <div style="flex:1;">
      <div style="font-size:13px;font-weight:700;color:#1A2E26;margin-bottom:7px;">
        Overall Adherence This Week
      </div>
      <div style="background:#E8EEE8;height:11px;border-radius:6px;overflow:hidden;">
        <div style="width:${barFillWidth};height:100%;background:${overallColor};border-radius:6px;"></div>
      </div>
      <div style="font-size:10px;color:#6B8178;margin-top:5px;">
        ${r.totalTaken} of ${r.totalScheduled - r.totalUpcoming} completed doses taken
        ${r.totalUpcoming > 0 ? ` · ${r.totalUpcoming} upcoming today` : ''}
      </div>
    </div>
  </div>
</div>

<!-- ═══ DAILY CHART ══════════════════════════════════════════ -->
<div class="section">
  <div class="section-label">Daily Adherence — 7-Day Trend</div>
  ${renderDayBars(r.dayStats)}
</div>

<!-- ═══ MEDICINE BREAKDOWN ══════════════════════════════════ -->
<div class="section">
  <div class="section-label">Medicine Breakdown</div>

  <table width="100%" style="border:1px solid #E8EEE8;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#1D9E75;">
        <th style="padding:10px 12px;text-align:left;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Medicine</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Frequency</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Scheduled</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Taken</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Missed</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Skipped</th>
        <th style="padding:10px 8px;text-align:center;color:white;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;">Adherence</th>
      </tr>
    </thead>
    <tbody>
      ${renderMedicineRows(r.medicines)}
    </tbody>
  </table>
</div>

<!-- ═══ FOOTER ═══════════════════════════════════════════════ -->
<div style="margin-top:28px;padding-top:14px;border-top:1px solid #E8EEE8;text-align:center;">
  <div style="font-size:9px;color:#A0B4AC;">
    This report was generated by MediMind · Confidential Medical Information
  </div>
  <div style="font-size:9px;color:#A0B4AC;margin-top:2px;">
    Share only with your authorized healthcare providers
  </div>
</div>

</body>
</html>`;
}
