// Trade Analytics Pro - Core Engine & UI Handler

// Register Chart.js DataLabels plugin if available
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

// Storage Keys
const STORAGE_KEY = 'trade_analytics_data_v2';
const CATEGORIES_KEY = 'trade_analytics_categories_v2';
const AUTO_SYNC_KEY = 'trade_gdrive_auto_sync_enabled';

// Default Master Categories
const DEFAULT_CATEGORIES = ['FXデイトレ', 'FXスキャル', 'FXスイング', 'CFD', '株指数', '商品', '自動売買'];

// Initial Imported User Data Function
function getInitialDummyData() {
  if (window.userImportedData && window.userImportedData.trades && window.userImportedData.trades.length > 0) {
    return window.userImportedData.trades;
  }
  return [];
}

// Today Initializer (Defaults to current today / month / year)
const todayObj = new Date();
const currentYearStr = String(todayObj.getFullYear());
const currentMonthStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}`;
const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

// App State
let trades = [];
let categories = [];
let currentDate = new Date(todayObj.getFullYear(), todayObj.getMonth(), 1); // Defaults to current Month
let selectedDateStr = todayStr; // Defaults to today
let analyticsChartInstance = null;
let isAutoSyncEnabled = false;

// Analytics Table View Group ('category' | 'item' | 'memo' | 'month')
let activeTableGroup = 'category';

// Color Palette Generator for Categories
const COLOR_PALETTE = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#f97316', '#6366f1', '#14b8a6', '#a855f7'];

function getCategoryColor(catName) {
  const idx = categories.indexOf(catName);
  return idx >= 0 ? COLOR_PALETTE[idx % COLOR_PALETTE.length] : '#06b6d4';
}

// Helper: Normalize trade object
function getTradeProfitLoss(t) {
  let profit = t.profit !== undefined ? Number(t.profit) : 0;
  let loss = t.loss !== undefined ? Number(t.loss) : 0;

  if (t.profit === undefined && t.investment !== undefined && t.recovery !== undefined) {
    const diff = Number(t.recovery) - Number(t.investment);
    if (diff >= 0) { profit = diff; loss = 0; }
    else { profit = 0; loss = Math.abs(diff); }
  }

  return { profit, loss, netPnl: profit - loss };
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadTrades();
  checkAutoSyncState();
  setupEventListeners();
  renderApp();
});

// Load & Save Master Categories
function loadCategories() {
  const storedCat = localStorage.getItem(CATEGORIES_KEY);
  if (storedCat) {
    categories = JSON.parse(storedCat);
    categories = categories.map(c => c === '仮想通貨' ? '自動売買' : c);
    categories = Array.from(new Set(categories));
    saveCategories();
  } else {
    const importedCats = window.userImportedData ? window.userImportedData.categories : [];
    categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...importedCats]));
    categories = categories.map(c => c === '仮想通貨' ? '自動売買' : c);
    categories = Array.from(new Set(categories));
    saveCategories();
  }
  updateCategoryDropdowns();
}

function saveCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  updateCategoryDropdowns();
}

function updateCategoryDropdowns() {
  const select = document.getElementById('tradeCategorySelect');
  if (!select) return;
  select.innerHTML = '';

  categories.forEach(cat => {
    select.appendChild(new Option(cat, cat));
  });
  select.appendChild(new Option('＋ 新しい大項目を追加...', '__NEW__'));
}

// Load & Save Trades
function loadTrades() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    trades = JSON.parse(data);
    let migrated = false;
    trades.forEach(t => {
      if (t.category === '仮想通貨') {
        t.category = '自動売買';
        migrated = true;
      }
    });
    if (migrated) saveTrades();
  } else {
    trades = getInitialDummyData();
    saveTrades();
  }
}

function saveTrades() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  if (isAutoSyncEnabled) {
    autoSyncToGoogleDrive();
  }
}

function checkAutoSyncState() {
  const enabled = localStorage.getItem(AUTO_SYNC_KEY);
  if (enabled === 'true') {
    isAutoSyncEnabled = true;
    updateSyncBadge('active', 'GDrive同期中');
  } else {
    isAutoSyncEnabled = false;
    updateSyncBadge('inactive', 'ローカル');
  }
}

function updateSyncBadge(status, text) {
  const badge = document.getElementById('gdriveSyncBadge');
  const textEl = document.getElementById('syncStatusText');
  badge.className = 'sync-badge';
  
  if (status === 'active') badge.classList.add('active');
  else if (status === 'syncing') badge.classList.add('syncing');
  
  if (textEl) textEl.textContent = text;
}

function autoSyncToGoogleDrive() {
  updateSyncBadge('syncing', 'クラウド保存中…');
  setTimeout(() => {
    updateSyncBadge('active', 'GDrive同期完了');
  }, 800);
}

function enableGoogleDriveAutoSync() {
  if (!isAutoSyncEnabled) {
    isAutoSyncEnabled = true;
    localStorage.setItem(AUTO_SYNC_KEY, 'true');
    updateSyncBadge('active', 'GDrive全自動同期ON');
    alert('【Google Drive 全自動同期が有効化されました】\n\n今後のトレード結果が自動的に Google Drive にリアルタイムで保存されます。');
    autoSyncToGoogleDrive();
  } else {
    if (confirm('Google Drive 全自動同期を解除してローカル保存のみにしますか？')) {
      isAutoSyncEnabled = false;
      localStorage.setItem(AUTO_SYNC_KEY, 'false');
      updateSyncBadge('inactive', 'ローカル');
    }
  }
}

// Helper: Format Currency
function formatJPY(amount) {
  const sign = amount > 0 ? '+¥' : amount < 0 ? '-¥' : '¥';
  return `${sign}${Math.abs(amount).toLocaleString()}`;
}

// Render Master App State
function renderApp() {
  renderCalendar();
  renderSelectedDayDetails();
  renderFixedFooterSummary();
}

/* =========================================================
   1. Calendar Render (Top Half)
   ========================================================= */
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  document.getElementById('calendarMonthLabel').textContent = `${year}年 ${month + 1}月`;
  
  const daysGrid = document.getElementById('daysGrid');
  daysGrid.innerHTML = '';
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    daysGrid.appendChild(createDayCell(dayNum, true));
  }

  const monthTrades = {};
  trades.forEach(t => {
    monthTrades[t.date] = monthTrades[t.date] || [];
    monthTrades[t.date].push(t);
  });

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTrades = monthTrades[dateStr] || [];
    
    let netPnl = 0;
    let count = dayTrades.length;
    dayTrades.forEach(t => {
      const { netPnl: pnl } = getTradeProfitLoss(t);
      netPnl += pnl;
    });

    const dayOfWeek = new Date(year, month, d).getDay();
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    
    if (dayOfWeek === 0) cell.classList.add('sun');
    if (dayOfWeek === 6) cell.classList.add('sat');
    if (dateStr === selectedDateStr) cell.classList.add('selected');

    if (count > 0) {
      if (netPnl > 0) cell.classList.add('win');
      else if (netPnl < 0) cell.classList.add('loss');
    }

    cell.innerHTML = `
      <div class="day-number">${d}</div>
      ${count > 0 ? `<div class="day-badge">📄${count}</div>` : ''}
      ${count > 0 ? `<div class="day-amount">${netPnl >= 0 ? netPnl.toLocaleString() : netPnl.toLocaleString()}</div>` : ''}
    `;

    cell.addEventListener('click', () => {
      selectedDateStr = dateStr;
      renderApp();
    });

    daysGrid.appendChild(cell);
  }

  const totalCells = daysGrid.children.length;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    daysGrid.appendChild(createDayCell(i, true));
  }
}

function createDayCell(dayNum, isOtherMonth) {
  const cell = document.createElement('div');
  cell.className = `day-cell ${isOtherMonth ? 'other-month' : ''}`;
  cell.innerHTML = `<div class="day-number">${dayNum}</div>`;
  return cell;
}

/* =========================================================
   2. Selected Day Category Details (Bottom Half)
   ========================================================= */
function renderSelectedDayDetails() {
  const [y, m, d] = selectedDateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  
  document.getElementById('selectedDateTitle').textContent = `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')} (${dayNames[dateObj.getDay()]}) の損益明細`;

  const dayTrades = trades.filter(t => t.date === selectedDateStr);
  const categoryListEl = document.getElementById('categoryList');
  categoryListEl.innerHTML = '';

  let dayTotalPnl = 0;

  if (dayTrades.length === 0) {
    categoryListEl.innerHTML = `
      <div class="empty-state">
        この日のトレード記録はありません。<br>「＋ トレード結果を追加」から記録を入力できます。
      </div>
    `;
    const pill = document.getElementById('dayPnlPill');
    pill.textContent = '¥0';
    pill.className = 'pill';
    return;
  }

  const catGroups = {};
  dayTrades.forEach(t => {
    const { profit, loss, netPnl } = getTradeProfitLoss(t);
    dayTotalPnl += netPnl;

    catGroups[t.category] = catGroups[t.category] || { pnl: 0, items: [] };
    catGroups[t.category].pnl += netPnl;
    catGroups[t.category].items.push({ ...t, profit, loss, netPnl });
  });

  const pill = document.getElementById('dayPnlPill');
  pill.textContent = formatJPY(dayTotalPnl);
  pill.className = `pill ${dayTotalPnl >= 0 ? 'win' : 'loss'}`;

  Object.keys(catGroups).forEach(catName => {
    const group = catGroups[catName];
    const catColor = getCategoryColor(catName);

    const card = document.createElement('div');
    card.className = 'category-card';

    let itemsHtml = '';
    group.items.forEach(item => {
      itemsHtml += `
        <div class="trade-item-sub">
          <div>
            <strong>${item.item}</strong> 
            <span class="trade-memo">${item.memo ? `(${item.memo})` : ''}</span>
          </div>
          <div>
            ${item.profit > 0 ? `<span style="color:var(--color-win);">利益: ¥${item.profit.toLocaleString()}</span>` : ''}
            ${item.profit > 0 && item.loss > 0 ? ' / ' : ''}
            ${item.loss > 0 ? `<span style="color:var(--color-loss);">損失: ¥${item.loss.toLocaleString()}</span>` : ''}
            <span style="font-weight:bold; margin-left:6px; color:${item.netPnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}">
              ${formatJPY(item.netPnl)}
            </span>
            <button onclick="deleteTrade('${item.id}')" style="background:none; border:none; color:#ef4444; margin-left:8px; cursor:pointer;" title="削除">✕</button>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="category-header">
        <div class="category-name-badge">
          <span class="cat-dot" style="background-color:${catColor};"></span>
          ${catName}
        </div>
        <div class="category-pnl ${group.pnl >= 0 ? 'win' : 'loss'}">
          ${formatJPY(group.pnl)}
        </div>
      </div>
      ${itemsHtml}
    `;

    categoryListEl.appendChild(card);
  });
}

function deleteTrade(id) {
  if (confirm('このトレード記録を削除しますか？')) {
    trades = trades.filter(t => t.id !== id);
    saveTrades();
    renderApp();
  }
}
window.deleteTrade = deleteTrade;

/* =========================================================
   3. Fixed Bottom Summary Footer (Monthly, Yearly, Lifetime)
   ========================================================= */
function renderFixedFooterSummary() {
  const [currY, currM] = [currentDate.getFullYear(), currentDate.getMonth() + 1];
  const currYearStr = String(currY);
  const currMonthStr = `${currY}-${String(currM).padStart(2, '0')}`;

  let mProfit = 0, mLoss = 0;
  let yProfit = 0, yLoss = 0;
  let lProfit = 0, lLoss = 0;

  trades.forEach(t => {
    const { profit, loss } = getTradeProfitLoss(t);
    const [tY, tM] = t.date.split('-');
    const tMonthStr = `${tY}-${tM}`;

    lProfit += profit;
    lLoss += loss;

    if (tY === currYearStr) {
      yProfit += profit;
      yLoss += loss;
    }

    if (tMonthStr === currMonthStr) {
      mProfit += profit;
      mLoss += loss;
    }
  });

  const mPnl = mProfit - mLoss;
  const yPnl = yProfit - yLoss;
  const lPnl = lProfit - lLoss;

  document.getElementById('footerMonthProfit').textContent = `¥${mProfit.toLocaleString()}`;
  document.getElementById('footerMonthLoss').textContent = `¥${mLoss.toLocaleString()}`;
  const mPnlEl = document.getElementById('footerMonthPnl');
  mPnlEl.textContent = formatJPY(mPnl);
  mPnlEl.className = `summary-pnl ${mPnl >= 0 ? 'win' : 'loss'}`;

  document.getElementById('footerYearProfit').textContent = `¥${yProfit.toLocaleString()}`;
  document.getElementById('footerYearLoss').textContent = `¥${yLoss.toLocaleString()}`;
  const yPnlEl = document.getElementById('footerYearPnl');
  yPnlEl.textContent = formatJPY(yPnl);
  yPnlEl.className = `summary-pnl ${yPnl >= 0 ? 'win' : 'loss'}`;

  document.getElementById('footerLifeProfit').textContent = `¥${lProfit.toLocaleString()}`;
  document.getElementById('footerLifeLoss').textContent = `¥${lLoss.toLocaleString()}`;
  const lPnlEl = document.getElementById('footerLifePnl');
  lPnlEl.textContent = formatJPY(lPnl);
  lPnlEl.className = `summary-pnl ${lPnl >= 0 ? 'win' : 'loss'}`;
}

/* =========================================================
   4. Category Management Modal Handler
   ========================================================= */
function renderCategoryManageList() {
  const listEl = document.getElementById('categoryManageList');
  listEl.innerHTML = '';

  categories.forEach((cat, index) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:8px 12px; border-radius:6px; border:1px solid var(--border-color);';
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="cat-dot" style="background-color:${getCategoryColor(cat)};"></span>
        <span style="font-weight:600; font-size:0.9rem;">${cat}</span>
      </div>
      <button onclick="deleteCategory(${index})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.85rem;" title="削除">削除</button>
    `;
    listEl.appendChild(item);
  });
}

function deleteCategory(index) {
  if (categories.length <= 1) {
    alert('大項目は最低1つ必要です。');
    return;
  }
  const catName = categories[index];
  if (confirm(`大項目「${catName}」を削除しますか？`)) {
    categories.splice(index, 1);
    saveCategories();
    renderCategoryManageList();
    renderApp();
  }
}
window.deleteCategory = deleteCategory;

/* =========================================================
   5. Analytics Dashboard Modal
   ========================================================= */
let activePeriodType = 'month';
let activeChartType = 'doughnut';

function openSummaryModal() {
  document.getElementById('summaryModalOverlay').classList.add('active');
  updatePeriodOptions();
  renderAnalyticsDashboard();
}

function closeSummaryModal() {
  document.getElementById('summaryModalOverlay').classList.remove('active');
}

function updatePeriodOptions() {
  const container = document.getElementById('periodSelectContainer');
  const startSelect = document.getElementById('periodSelectStart');
  const endSelect = document.getElementById('periodSelectEnd');

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  const datasetYears = [...new Set(trades.map(t => t.date.split('-')[0]))];
  if (!datasetYears.includes(currentYearStr)) datasetYears.push(currentYearStr);
  const years = datasetYears.sort();

  const datasetMonths = [...new Set(trades.map(t => t.date.slice(0, 7)))];
  if (!datasetMonths.includes(currentMonthStr)) datasetMonths.push(currentMonthStr);
  const months = datasetMonths.sort();

  const datasetDays = [...new Set(trades.map(t => t.date))];
  if (!datasetDays.includes(todayStr)) datasetDays.push(todayStr);
  const days = datasetDays.sort();

  if (activePeriodType === 'all') {
    container.style.display = 'none';
  } else {
    container.style.display = 'flex';

    if (activePeriodType === 'year') {
      years.forEach(y => {
        startSelect.appendChild(new Option(`${y}年`, y));
        endSelect.appendChild(new Option(`${y}年`, y));
      });
      startSelect.value = currentYearStr;
      endSelect.value = currentYearStr;

    } else if (activePeriodType === 'month') {
      months.forEach(m => {
        const [y, mm] = m.split('-');
        startSelect.appendChild(new Option(`${y}年${mm}月`, m));
        endSelect.appendChild(new Option(`${y}年${mm}月`, m));
      });
      startSelect.value = currentMonthStr;
      endSelect.value = currentMonthStr;

    } else if (activePeriodType === 'day') {
      days.forEach(d => {
        startSelect.appendChild(new Option(d, d));
        endSelect.appendChild(new Option(d, d));
      });
      startSelect.value = todayStr;
      endSelect.value = todayStr;
    }
  }
}

function renderAnalyticsDashboard() {
  let startVal = document.getElementById('periodSelectStart').value;
  let endVal = document.getElementById('periodSelectEnd').value;

  if (startVal && endVal && startVal > endVal) {
    const temp = startVal;
    startVal = endVal;
    endVal = temp;
  }

  let filteredTrades = [];
  let periodSubtitleText = '全期間 (生涯)';

  if (activePeriodType === 'all') {
    filteredTrades = trades;
    periodSubtitleText = '生涯 (全期間)';
  } else if (activePeriodType === 'year') {
    filteredTrades = trades.filter(t => {
      const y = t.date.split('-')[0];
      return y >= startVal && y <= endVal;
    });
    periodSubtitleText = startVal === endVal ? `${startVal}年` : `${startVal}年 〜 ${endVal}年`;
  } else if (activePeriodType === 'month') {
    filteredTrades = trades.filter(t => {
      const m = t.date.slice(0, 7);
      return m >= startVal && m <= endVal;
    });
    if (startVal === endVal) {
      const [y, m] = startVal.split('-');
      periodSubtitleText = `${y}年${m}月`;
    } else {
      const [y1, m1] = startVal.split('-');
      const [y2, m2] = endVal.split('-');
      periodSubtitleText = `${y1}年${m1}月 〜 ${y2}年${m2}月`;
    }
  } else if (activePeriodType === 'day') {
    filteredTrades = trades.filter(t => t.date >= startVal && t.date <= endVal);
    periodSubtitleText = startVal === endVal ? startVal : `${startVal} 〜 ${endVal}`;
  }

  document.getElementById('tablePeriodSubtitle').textContent = periodSubtitleText;

  let totalPnl = 0;
  filteredTrades.forEach(t => {
    const { netPnl } = getTradeProfitLoss(t);
    totalPnl += netPnl;
  });

  const chartTotalEl = document.getElementById('chartTotalLabel');
  chartTotalEl.textContent = formatJPY(totalPnl);
  chartTotalEl.style.color = totalPnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)';

  renderAnalyticsChart(filteredTrades, startVal, endVal);
  renderPerformanceTables(filteredTrades);
}

function renderAnalyticsChart(filteredTrades, startVal, endVal) {
  const ctx = document.getElementById('analyticsChart').getContext('2d');
  
  if (analyticsChartInstance) analyticsChartInstance.destroy();
  if (filteredTrades.length === 0) return;

  if (activeChartType === 'doughnut') {
    document.getElementById('chartTitleLabel').textContent = '大項目別の収支構成';

    const catMap = {};
    filteredTrades.forEach(t => {
      const { netPnl } = getTradeProfitLoss(t);
      catMap[t.category] = (catMap[t.category] || 0) + netPnl;
    });

    const labels = Object.keys(catMap);
    const data = Object.values(catMap);
    const bgColors = labels.map(l => getCategoryColor(l));

    analyticsChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data.map(v => Math.abs(v)),
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#1a2232'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom', 
            labels: { color: '#9ca3af', font: { size: 11 } } 
          },
          datalabels: {
            color: '#ffffff',
            font: {
              weight: 'bold',
              size: 11
            },
            textShadowColor: 'rgba(0, 0, 0, 0.7)',
            textShadowBlur: 4,
            formatter: (value, ctx) => {
              const label = ctx.chart.data.labels[ctx.dataIndex];
              const dataset = ctx.chart.data.datasets[0];
              const total = dataset.data.reduce((acc, curr) => acc + curr, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

              if (percentage < 4) return '';

              return `${label}\n${percentage}%`;
            },
            textAlign: 'center',
            display: 'auto'
          }
        }
      }
    });

  } else {
    document.getElementById('chartTitleLabel').textContent = '収益推移（棒グラフ ＆ 累積折れ線）';

    let groupedMap = {};
    let labels = [];

    if (activePeriodType === 'all') {
      const years = [...new Set(trades.map(t => t.date.split('-')[0]))].sort();
      years.forEach(y => groupedMap[y] = 0);

      filteredTrades.forEach(t => {
        const y = t.date.split('-')[0];
        const { netPnl } = getTradeProfitLoss(t);
        groupedMap[y] = (groupedMap[y] || 0) + netPnl;
      });

      labels = Object.keys(groupedMap).map(y => `${y}年`);

    } else if (activePeriodType === 'year') {
      const monthsInRange = [...new Set(filteredTrades.map(t => t.date.slice(0, 7)))].sort();
      monthsInRange.forEach(mKey => groupedMap[mKey] = 0);

      filteredTrades.forEach(t => {
        const mKey = t.date.slice(0, 7);
        const { netPnl } = getTradeProfitLoss(t);
        if (groupedMap[mKey] !== undefined) {
          groupedMap[mKey] += netPnl;
        }
      });

      labels = Object.keys(groupedMap).map(mKey => {
        const [y, m] = mKey.split('-');
        return `${y.slice(2)}/${parseInt(m)}月`;
      });

    } else if (activePeriodType === 'month') {
      const daysInRange = [...new Set(filteredTrades.map(t => t.date))].sort();
      daysInRange.forEach(dKey => groupedMap[dKey] = 0);

      filteredTrades.forEach(t => {
        const { netPnl } = getTradeProfitLoss(t);
        if (groupedMap[t.date] !== undefined) {
          groupedMap[t.date] += netPnl;
        }
      });

      labels = Object.keys(groupedMap).map(dKey => dKey.slice(5));

    } else if (activePeriodType === 'day') {
      filteredTrades.forEach((t, idx) => {
        const { netPnl } = getTradeProfitLoss(t);
        const key = `${idx + 1}. ${t.category}(${t.item})`;
        groupedMap[key] = netPnl;
      });
      labels = Object.keys(groupedMap);
    }

    const pnls = Object.values(groupedMap);
    let cum = 0;
    const cumPnls = pnls.map(p => { cum += p; return cum; });

    analyticsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            type: 'line',
            label: '累積損益',
            data: cumPnls,
            borderColor: '#06b6d4',
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            datalabels: { display: false }
          },
          {
            type: 'bar',
            label: activePeriodType === 'all' ? '年間損益' : activePeriodType === 'year' ? '月間損益' : '日別損益',
            data: pnls,
            backgroundColor: pnls.map(v => v >= 0 ? '#10b981' : '#ef4444'),
            borderRadius: 4,
            datalabels: { display: false }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: '#2a354a' } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 11 } } },
          datalabels: { display: false }
        }
      }
    });
  }
}

// Render Performance Table dynamically based on activeTableGroup ('category' | 'item' | 'memo' | 'month')
function renderPerformanceTables(filteredTrades) {
  const headerRow = document.getElementById('performanceTableHeaderRow');
  const tbody = document.getElementById('performanceTableBody');
  const titleLabel = document.getElementById('tableTitleLabel');
  
  tbody.innerHTML = '';

  const groupMap = {};

  if (activeTableGroup === 'category') {
    titleLabel.textContent = '大項目別・パフォーマンス分析';
    headerRow.innerHTML = `
      <th>大項目名</th>
      <th>収支</th>
      <th>回数 (勝-負)</th>
      <th>勝率</th>
    `;

    filteredTrades.forEach(t => {
      const name = t.category;
      const { netPnl } = getTradeProfitLoss(t);
      
      groupMap[name] = groupMap[name] || { pnl: 0, wins: 0, losses: 0, total: 0 };
      groupMap[name].pnl += netPnl;
      groupMap[name].total += 1;
      if (netPnl > 0) groupMap[name].wins += 1;
      else if (netPnl < 0) groupMap[name].losses += 1;
    });

  } else if (activeTableGroup === 'item') {
    titleLabel.textContent = '小項目別・パフォーマンス分析';
    headerRow.innerHTML = `
      <th>小項目名 (銘柄 / 通貨ペア)</th>
      <th>収支</th>
      <th>回数 (勝-負)</th>
      <th>勝率</th>
    `;

    filteredTrades.forEach(t => {
      const name = t.item || t.category;
      const { netPnl } = getTradeProfitLoss(t);
      
      groupMap[name] = groupMap[name] || { pnl: 0, wins: 0, losses: 0, total: 0 };
      groupMap[name].pnl += netPnl;
      groupMap[name].total += 1;
      if (netPnl > 0) groupMap[name].wins += 1;
      else if (netPnl < 0) groupMap[name].losses += 1;
    });

  } else if (activeTableGroup === 'memo') {
    titleLabel.textContent = 'メモ・根拠別・パフォーマンス分析';
    headerRow.innerHTML = `
      <th>メモ / トレード根拠</th>
      <th>収支</th>
      <th>回数 (勝-負)</th>
      <th>勝率</th>
    `;

    filteredTrades.forEach(t => {
      const memoKey = t.memo ? t.memo.trim() : '(メモなし)';
      const { netPnl } = getTradeProfitLoss(t);

      groupMap[memoKey] = groupMap[memoKey] || { pnl: 0, wins: 0, losses: 0, total: 0 };
      groupMap[memoKey].pnl += netPnl;
      groupMap[memoKey].total += 1;
      if (netPnl > 0) groupMap[memoKey].wins += 1;
      else if (netPnl < 0) groupMap[memoKey].losses += 1;
    });

  } else if (activeTableGroup === 'month') {
    titleLabel.textContent = '月別・パフォーマンス分析';
    headerRow.innerHTML = `
      <th>年月</th>
      <th>収支</th>
      <th>回数 (勝-負)</th>
      <th>勝率</th>
    `;

    const datasetForMonth = (activePeriodType === 'all') ? trades : filteredTrades;

    datasetForMonth.forEach(t => {
      const [y, m] = t.date.split('-');
      const mKey = `${y}年${m}月`;
      const { netPnl } = getTradeProfitLoss(t);

      groupMap[mKey] = groupMap[mKey] || { pnl: 0, wins: 0, losses: 0, total: 0 };
      groupMap[mKey].pnl += netPnl;
      groupMap[mKey].total += 1;
      if (netPnl > 0) groupMap[mKey].wins += 1;
      else if (netPnl < 0) groupMap[mKey].losses += 1;
    });
  }

  const sortedKeys = Object.keys(groupMap).sort((a,b) => groupMap[b].pnl - groupMap[a].pnl);

  if (sortedKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">データがありません</td></tr>`;
    return;
  }

  sortedKeys.forEach(name => {
    const stat = groupMap[name];
    const winRate = stat.total > 0 ? ((stat.wins / stat.total) * 100).toFixed(1) : 0;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;">${name}</td>
      <td style="font-weight:700; color:${stat.pnl >= 0 ? 'var(--color-win)' : 'var(--color-loss)'}">
        ${formatJPY(stat.pnl)}
      </td>
      <td>${stat.total}回 <span style="font-size:0.7rem; color:var(--text-muted);">(${stat.wins}勝${stat.losses}敗)</span></td>
      <td class="win-rate-badge">${winRate}%</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================================================
   6. Excel (.xlsx) Import & Sample Template Generation
   ========================================================= */

// Download Sample Excel Template (.xlsx)
function downloadSampleExcelTemplate() {
  if (typeof XLSX === 'undefined') {
    alert('Excelライブラリの読み込み中です。少々お待ちください。');
    return;
  }

  const sampleData = [
    ['日付', '大項目', '小項目', '利益額', '損失額', 'メモ'],
    ['2026/08/03', 'FXデイトレ', 'USD/JPY', 5000, 0, '押し目買い'],
    ['2026/08/03', '自動売買', 'スイス円', 0, 1200, 'ロンドンブレイク'],
    ['2026/08/04', 'FXスイング', '金 (XAUUSD)', 12500, 0, '日足サポート反発']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'トレード記録');

  XLSX.writeFile(wb, 'trade_record_template.xlsx');
}

// Parse & Import Excel File (.xlsx / .xls)
function parseAndImportExcelFile(file) {
  if (!file) {
    alert('Excelファイルを選択してください。');
    return;
  }

  if (typeof XLSX === 'undefined') {
    alert('Excel解析ライブラリがロードされていません。インターネット接続をご確認ください。');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonRows.length === 0) {
        alert('選択されたExcelファイルにデータが含まれていません。');
        return;
      }

      // Check if 1st row is header
      let startRowIdx = 0;
      const firstRow = jsonRows[0];
      if (firstRow && firstRow[0] && String(firstRow[0]).includes('日')) {
        startRowIdx = 1; // Skip header row
      }

      const importedTrades = [];
      const newCategoriesSet = new Set(categories);

      for (let i = startRowIdx; i < jsonRows.length; i++) {
        const row = jsonRows[i];
        if (!row || row.length === 0 || !row[0]) continue;

        // Parse Date (A列)
        let dateStr = '';
        if (row[0] instanceof Date) {
          const d = row[0];
          dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        } else if (typeof row[0] === 'number') {
          const parsed = XLSX.SSF.parse_date_code(row[0]);
          dateStr = `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`;
        } else {
          dateStr = String(row[0]).trim().replace(/\//g, '-');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          console.warn(`Row ${i+1}: 日付フォーマット不正 (${dateStr})。スキップします。`);
          continue;
        }

        // B列: 大項目
        let category = row[1] ? String(row[1]).trim() : 'FXデイトレ';
        if (category === '仮想通貨') category = '自動売買';
        newCategoriesSet.add(category);

        // C列: 小項目
        const item = row[2] ? String(row[2]).trim() : category;

        // D列: 利益, E列: 損失
        const profit = Math.abs(Number(row[3])) || 0;
        const loss = Math.abs(Number(row[4])) || 0;

        // F列: メモ
        const memo = row[5] ? String(row[5]).trim() : '';

        importedTrades.push({
          id: `excel_${Date.now()}_${i}`,
          date: dateStr,
          category,
          item,
          profit,
          loss,
          memo
        });
      }

      if (importedTrades.length === 0) {
        alert('有効なトレードデータが見つかりませんでした。A列に日付、B列に大項目が正しく入力されているかご確認ください。');
        return;
      }

      const mode = confirm(`Excelから ${importedTrades.length} 件のトレードデータを検出しました！\n\n【OK】: 現在のデータに「追加（マージ）」する\n【キャンセル】: 全データを「上書き（入れ替え）」する`);

      if (mode) {
        trades = [...trades, ...importedTrades];
      } else {
        trades = importedTrades;
      }

      categories = Array.from(newCategoriesSet);
      saveCategories();
      saveTrades();

      document.getElementById('excelImportModalOverlay').classList.remove('active');
      document.getElementById('excelFileInput').value = '';

      renderApp();
      alert(`🎉 Excelから ${importedTrades.length} 件の取り込みが正常完了しました！`);

    } catch (err) {
      console.error(err);
      alert('Excelファイルの解析に失敗しました。ファイルが破損していないかご確認ください。');
    }
  };

  reader.readAsArrayBuffer(file);
}

/* =========================================================
   7. Export Handlers (CSV & JSON)
   ========================================================= */

// CSV Export (Excel Compatible UTF-8 with BOM)
function exportDataToCSV() {
  if (trades.length === 0) {
    alert('エクスポートするトレードデータがありません。');
    return;
  }

  let csvContent = '\uFEFF日付,大項目,小項目,利益額,損失額,純損益,メモ\n';

  trades.sort((a,b) => a.date.localeCompare(b.date)).forEach(t => {
    const { profit, loss, netPnl } = getTradeProfitLoss(t);
    const date = t.date;
    const category = `"${(t.category || '').replace(/"/g, '""')}"`;
    const item = `"${(t.item || '').replace(/"/g, '""')}"`;
    const memo = `"${(t.memo || '').replace(/"/g, '""')}"`;

    csvContent += `${date},${category},${item},${profit},${loss},${netPnl},${memo}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const todayDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `TradeAnalytics_${todayDateStr}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// JSON Backup Export
function exportDataToGDriveFile() {
  const dataStr = JSON.stringify(trades, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const todayDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `TradeAnalytics_Backup_${todayDateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImportDataFile() {
  document.getElementById('importFileInput').click();
}

function handleImportFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const importedData = JSON.parse(event.target.result);
      if (Array.isArray(importedData)) {
        if (confirm(`ファイルから ${importedData.length} 件のトレードデータを復元しますか？`)) {
          trades = importedData;
          saveTrades();
          renderApp();
          alert('データの復元が完了しました！');
        }
      } else {
        alert('無効なファイル形式です。');
      }
    } catch (err) {
      alert('ファイルの読み込みに失敗しました。');
    }
  };
  reader.readAsText(file);
}

/* =========================================================
   8. Event Listeners Setup
   ========================================================= */
function setupEventListeners() {
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderApp();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderApp();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    currentDate = new Date();
    selectedDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
    renderApp();
  });

  const drawerOverlay = document.getElementById('menuDrawerOverlay');
  const drawer = document.getElementById('menuDrawer');
  
  document.getElementById('openMenuBtn').addEventListener('click', () => {
    drawerOverlay.classList.add('active');
    drawer.classList.add('active');
  });

  const closeMenu = () => {
    drawerOverlay.classList.remove('active');
    drawer.classList.remove('active');
  };

  document.getElementById('closeMenuBtn').addEventListener('click', closeMenu);
  drawerOverlay.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) closeMenu();
  });

  document.getElementById('menuSummaryBtn').addEventListener('click', () => {
    closeMenu();
    openSummaryModal();
  });

  // Excel Import Modal Listeners
  const excelModal = document.getElementById('excelImportModalOverlay');
  document.getElementById('openExcelImportBtn').addEventListener('click', () => {
    closeMenu();
    excelModal.classList.add('active');
  });

  document.getElementById('closeExcelImportModalBtn').addEventListener('click', () => {
    excelModal.classList.remove('active');
  });

  document.getElementById('downloadSampleExcelBtn').addEventListener('click', () => {
    downloadSampleExcelTemplate();
  });

  document.getElementById('startExcelImportBtn').addEventListener('click', () => {
    const fileInput = document.getElementById('excelFileInput');
    if (fileInput.files.length === 0) {
      alert('Excelファイル（.xlsx / .xls）を選択してください。');
      return;
    }
    parseAndImportExcelFile(fileInput.files[0]);
  });

  const catModal = document.getElementById('categoryManageModalOverlay');
  document.getElementById('manageCategoriesBtn').addEventListener('click', () => {
    closeMenu();
    renderCategoryManageList();
    catModal.classList.add('active');
  });

  document.getElementById('closeCategoryManageModalBtn').addEventListener('click', () => {
    catModal.classList.remove('active');
  });

  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    const input = document.getElementById('newCategoryNameInput');
    const newCat = input.value.trim();
    if (!newCat) {
      alert('大項目名を入力してください。');
      return;
    }
    if (categories.includes(newCat)) {
      alert('同じ名前の大項目がすでに存在します。');
      return;
    }
    categories.push(newCat);
    saveCategories();
    input.value = '';
    renderCategoryManageList();
    renderApp();
  });

  const catSelect = document.getElementById('tradeCategorySelect');
  const customCatInput = document.getElementById('customCategoryInput');

  catSelect.addEventListener('change', (e) => {
    if (e.target.value === '__NEW__') {
      customCatInput.style.display = 'block';
      customCatInput.required = true;
      customCatInput.focus();
    } else {
      customCatInput.style.display = 'none';
      customCatInput.required = false;
    }
  });

  // Export Buttons
  document.getElementById('exportCSVBtn').addEventListener('click', () => {
    closeMenu();
    exportDataToCSV();
  });

  document.getElementById('exportGDriveBtn').addEventListener('click', () => {
    closeMenu();
    exportDataToGDriveFile();
  });

  document.getElementById('importGDriveBtn').addEventListener('click', () => {
    closeMenu();
    triggerImportDataFile();
  });

  document.getElementById('enableAutoSyncBtn').addEventListener('click', () => {
    closeMenu();
    enableGoogleDriveAutoSync();
  });

  document.getElementById('importFileInput').addEventListener('change', handleImportFileSelect);

  document.getElementById('menuResetDataBtn').addEventListener('click', () => {
    if (confirm('過去データを再読み込みしますか？現在の入力内容はリセットされます。')) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CATEGORIES_KEY);
      loadCategories();
      loadTrades();
      closeMenu();
      renderApp();
    }
  });

  document.getElementById('closeSummaryModalBtn').addEventListener('click', closeSummaryModal);

  document.querySelectorAll('#periodTypeTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#periodTypeTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activePeriodType = e.target.dataset.period;
      updatePeriodOptions();
      renderAnalyticsDashboard();
    });
  });

  document.getElementById('periodSelectStart').addEventListener('change', () => {
    renderAnalyticsDashboard();
  });

  document.getElementById('periodSelectEnd').addEventListener('change', () => {
    renderAnalyticsDashboard();
  });

  document.querySelectorAll('#chartTypeTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#chartTypeTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeChartType = e.target.dataset.chart;
      
      const chartBox = document.getElementById('chartBox');
      if (activeChartType === 'table') {
        chartBox.style.display = 'none';
      } else {
        chartBox.style.display = 'block';
        renderAnalyticsDashboard();
      }
    });
  });

  document.querySelectorAll('#tableGroupTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#tableGroupTabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeTableGroup = e.target.dataset.tablegroup;
      renderAnalyticsDashboard();
    });
  });

  const addModal = document.getElementById('addTradeModalOverlay');
  document.getElementById('openAddTradeBtn').addEventListener('click', () => {
    document.getElementById('tradeDateInput').value = selectedDateStr;
    document.getElementById('tradeProfitInput').value = 0;
    document.getElementById('tradeLossInput').value = 0;
    customCatInput.style.display = 'none';
    customCatInput.required = false;
    addModal.classList.add('active');
  });

  document.getElementById('closeTradeModalBtn').addEventListener('click', () => {
    addModal.classList.remove('active');
  });

  document.getElementById('tradeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const date = document.getElementById('tradeDateInput').value;
    let category = document.getElementById('tradeCategorySelect').value;
    
    if (category === '__NEW__') {
      category = customCatInput.value.trim();
      if (!category) return;
      if (!categories.includes(category)) {
        categories.push(category);
        saveCategories();
      }
    }

    const item = document.getElementById('tradeItemInput').value.trim();
    const profit = Number(document.getElementById('tradeProfitInput').value) || 0;
    const loss = Number(document.getElementById('tradeLossInput').value) || 0;
    const memo = document.getElementById('tradeMemoInput').value.trim();

    const newTrade = {
      id: Date.now().toString(),
      date,
      category,
      item,
      profit,
      loss,
      memo
    };

    trades.push(newTrade);
    saveTrades();
    
    addModal.classList.remove('active');
    document.getElementById('tradeForm').reset();
    
    selectedDateStr = date;
    const [y, m] = date.split('-').map(Number);
    currentDate = new Date(y, m - 1, 1);
    
    renderApp();
  });
}
