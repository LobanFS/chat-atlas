const COLORS = { a: '#147d78', b: '#6760d5', ink: '#26364b', muted: '#66788b', line: '#e7edf1' };
const MEDIA = [
  ['photo', 'Фотографии'], ['voice_message', 'Голосовые'], ['video_message', 'Видеокружки'],
  ['video_file', 'Видео'], ['sticker', 'Стикеры'], ['animation', 'GIF и анимации'],
  ['audio_file', 'Аудиофайлы'], ['file', 'Файлы'], ['other', 'Другие вложения'],
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const num = (value) => finite(value) ? value : 0;
const int = (value) => nf.format(num(value));
const dec = (value) => decimal.format(num(value));
const pct = (value) => finite(value) ? `${decimal.format(value)}%` : '—';
const clamp = (value, max = 100) => Math.max(0, Math.min(max, num(value)));
const ratio = (value, total) => total > 0 ? value / total * 100 : 0;

function duration(seconds) {
  if (!finite(seconds)) return '—';
  const s = Math.max(0, seconds);
  if (s < 60) return `${dec(s)} с`;
  if (s < 3600) return `${dec(s / 60)} мин`;
  if (s < 86400) return `${dec(s / 3600)} ч`;
  return `${dec(s / 86400)} дн`;
}

function dateLabel(value, full = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value || '—');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', ...(full ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(date);
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value))) return String(value || '—');
  const date = new Date(`${value}-15T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function sectionHead(kicker, title, note = '') {
  return `<div class="section-head"><div><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2></div>${note ? `<p class="section-note">${esc(note)}</p>` : ''}</div>`;
}

function personName(person, fallback = 'Участник') {
  return esc(person?.name || fallback);
}

function legend(participants, average = false) {
  return `<div class="chart-legend" aria-label="Обозначения">${participants.map((p) => `<span class="legend-item"><span class="legend-dot person-${p.key === 'b' ? 'b' : 'a'}" aria-hidden="true"></span>${personName(p)}</span>`).join('')}${average ? '<span class="legend-item"><span class="legend-dot legend-average" aria-hidden="true"></span>Среднее за 7 дней</span>' : ''}</div>`;
}

function empty(message) {
  return `<p class="empty-state">${esc(message)}</p>`;
}

function stat(value, label, note = '') {
  return `<div class="stat-card"><p class="stat-value">${esc(value)}</p><p class="stat-label">${esc(label)}</p>${note ? `<p class="stat-note">${esc(note)}</p>` : ''}</div>`;
}

function overview(data) {
  const s = data.summary || {};
  const participants = data.participants || [];
  const hasBoth = participants.length === 2;
  const indices = [
    { label: 'Равномерность сообщений', value: hasBoth ? s.mutualityScore : null, note: hasBoth ? '100 — одинаковое число сообщений. Объём, а не чувства.' : 'Нужны сообщения двух участников.', formula: '100 × (1 − |A − B| / (A + B))' },
    { label: 'Двусторонние сессии', value: s.exchangeScore, note: 'Доля сессий, в которых написали оба участника.', formula: 'Сессии с двумя авторами / все сессии × 100' },
    { label: 'Активные дни', value: s.continuityScore, note: 'Доля календарных дней хотя бы с одним сообщением.', formula: 'Активные дни / все дни периода × 100' },
  ];
  return `<section class="report-section" id="overview">${sectionHead('01 / Общая картина', 'Ваш диалог в цифрах', 'Наблюдения о переписке. Без догадок о людях.')}
    <div class="stat-grid">${stat(int(s.messages), 'сообщений', `${int(s.days)} календарных дней в периоде`)}${stat(int(s.activeDays), 'дней на связи', `${pct(s.activeDayPct)} от периода`)}${stat(dec(s.messagesPerActiveDay), 'сообщений в активный день', 'Дни без сообщений не входят в среднее')}${stat(int(s.sessions), 'сессий общения', `Новая сессия после паузы от ${dec(data.meta?.sessionGapHours)} ч`)}</div>
    <div class="index-grid">${indices.map((item, i) => `<article class="index-card"><div class="index-top"><span class="index-label">${esc(item.label)}</span><span class="index-number">0${i + 1}</span></div><p class="index-value">${finite(item.value) ? int(item.value) : '—'}<span> / 100</span></p><div class="index-meter" aria-hidden="true"><span style="width:${clamp(item.value)}%"></span></div><p class="stat-note">${esc(item.note)}</p><details class="index-formula"><summary>Как считается</summary><p>${esc(item.formula)}</p></details></article>`).join('')}</div>
    <p class="panel-note index-disclaimer">Эти индексы описывают числа и не измеряют взаимную симпатию, качество отношений или вовлечённость человека.</p>
    ${(data.insights || []).length ? `<div class="insight-grid">${data.insights.map((item) => `<article class="insight-card tone-${['neutral', 'positive', 'attention'].includes(item.tone) ? item.tone : 'neutral'}"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}</div>` : ''}
  </section>`;
}

function chartBounds(maxValue) {
  if (!(maxValue > 0)) return 4;
  const power = 10 ** Math.floor(Math.log10(maxValue));
  const normalized = maxValue / power;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 4 ? 4 : normalized <= 5 ? 5 : normalized <= 8 ? 8 : 10;
  return nice * power;
}

function dailyChart(data) {
  const daily = data.daily || [];
  if (!daily.length) return empty('В выбранном периоде пока нет данных для графика.');
  const width = 1060, height = 330, left = 60, right = 20, top = 25, bottom = 49;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = chartBounds(Math.max(...daily.map((d) => Math.max(num(d.total), num(d.avg7)))));
  const step = plotW / daily.length;
  const y = (value) => top + plotH - num(value) / max * plotH;
  const x = (i) => left + (i + 0.5) * step;
  const barW = Math.max(0.35, step * 0.79);
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = max * i / 4;
    return `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="${COLORS.line}"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end" fill="${COLORS.muted}" font-size="12">${esc(dec(value))}</text>`;
  }).join('');
  let pathA = '', pathB = '', line = '', open = false;
  daily.forEach((d, i) => {
    const px = x(i) - barW / 2;
    const a = num(d.a), b = num(d.b);
    if (a > 0) pathA += `M${px.toFixed(2)},${y(a).toFixed(2)}h${barW.toFixed(2)}V${y(0).toFixed(2)}h-${barW.toFixed(2)}Z`;
    if (b > 0) pathB += `M${px.toFixed(2)},${y(a + b).toFixed(2)}h${barW.toFixed(2)}V${y(a).toFixed(2)}h-${barW.toFixed(2)}Z`;
    if (finite(d.avg7)) { line += `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(d.avg7).toFixed(2)}`; open = true; } else open = false;
  });
  const tickCount = Math.min(6, daily.length);
  const tickIndexes = [...new Set(Array.from({ length: tickCount }, (_, i) => tickCount === 1 ? 0 : Math.round(i * (daily.length - 1) / (tickCount - 1))))];
  const labels = tickIndexes.map((i, at) => `<text x="${x(i)}" y="${height - 17}" text-anchor="${at === 0 ? 'start' : at === tickIndexes.length - 1 ? 'end' : 'middle'}" fill="${COLORS.muted}" font-size="13">${esc(dateLabel(daily[i].date))}</text>`).join('');
  const peak = daily.reduce((best, day) => num(day.total) > num(best.total) ? day : best, daily[0]);
  return `${legend(data.participants || [], true)}<p class="chart-scroll-hint">График шире экрана · прокрутите вправо →</p><div class="chart-wrap"><svg class="chart wide-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="daily-title daily-desc" xmlns="http://www.w3.org/2000/svg"><title id="daily-title">Сообщения по дням</title><desc id="daily-desc">${esc(`${daily.length} календарных дней. Самый активный день: ${dateLabel(peak.date, true)}, ${int(peak.total)} сообщений. Столбцы разделены по участникам; линия — скользящее среднее за 7 дней. Полные значения в таблице под графиком.`)}</desc><g font-family="system-ui,sans-serif">${grid}<path d="${pathA}" fill="${COLORS.a}"/><path d="${pathB}" fill="${COLORS.b}"/>${line ? `<path d="${line}" stroke="${COLORS.ink}" stroke-width="2.3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` : ''}${labels}</g></svg></div>
  <p class="panel-note">Один столбец — один календарный день, включая дни без сообщений. Линия сглаживает колебания за 7 дней.</p>
  <details class="data-details"><summary>Все дневные значения · ${int(daily.length)} дней</summary><div class="table-scroll"><table class="metric-table"><caption class="sr-only">Количество сообщений за каждый день</caption><thead><tr><th scope="col">Дата</th><th scope="col">Всего</th>${(data.participants || []).map((p) => `<th scope="col">${personName(p)}</th>`).join('')}<th scope="col">Среднее за 7 дней</th></tr></thead><tbody>${daily.map((d) => `<tr><th scope="row">${esc(dateLabel(d.date, true))}</th><td>${int(d.total)}</td>${(data.participants || []).map((p) => `<td>${int(d[p.key === 'b' ? 'b' : 'a'])}</td>`).join('')}<td>${finite(d.avg7) ? dec(d.avg7) : '—'}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function trendPanel(data) {
  const t = data.trend || {};
  if (!t.available) return `<div class="panel trend-panel"><div class="panel-head"><h3>Как меняется темп</h3><span class="badge">Мало данных</span></div>${empty('Для сравнения нужны 7 полных последних дней и 28 полных предыдущих дней. Первый и последний день экспорта не участвуют.')}<p class="panel-note">Небольшой фрагмент переписки не позволяет надёжно описать длительную динамику.</p></div>`;
  const change = finite(t.changePct) ? `${t.changePct > 0 ? '+' : ''}${dec(t.changePct)}%` : 'Новый период активности';
  const label = t.direction === 'up' ? 'Темп вырос' : t.direction === 'down' ? 'Темп снизился' : 'Темп примерно прежний';
  const complete = (data.daily || []).slice(1, Math.max(1, (data.daily || []).length - 1));
  const current = complete.slice(-num(t.comparisonDays));
  const previous = complete.slice(-(num(t.comparisonDays) + num(t.baselineDays)), -num(t.comparisonDays));
  const range = (days) => days.length ? `<span>${esc(dateLabel(days[0].date, true))} — ${esc(dateLabel(days.at(-1).date, true))}</span>` : '';
  const delta = num(t.currentMean) - num(t.previousMean);
  const deltaText = `${delta > 0 ? '+' : ''}${dec(delta)}`;
  return `<div class="panel trend-panel"><div class="panel-head"><h3>Как меняется темп</h3><span class="badge">${esc(label)}</span></div><p class="trend-value">${esc(change)}</p><div class="trend-comparison"><div><strong>${dec(t.currentMean)}</strong><span>сообщений/день · последние ${int(t.comparisonDays)} дней</span>${range(current)}</div><div><strong>${dec(t.previousMean)}</strong><span>сообщений/день · предыдущие ${int(t.baselineDays)} дней</span>${range(previous)}</div></div><p class="panel-note"><strong>Изменение среднего: ${esc(deltaText)} сообщ./день.</strong></p><p class="panel-note">Сравниваем средний объём за два окна, включая дни тишины. Крайние дни экспорта исключены. Это описание изменения, а не проверка статистической значимости и не объяснение его причин.</p></div>`;
}

function rhythm(data) {
  const s = data.summary || {};
  const daily = data.daily || [];
  const peak = daily.length ? daily.reduce((best, day) => num(day.total) > num(best.total) ? day : best, daily[0]) : null;
  return `<section class="report-section" id="rhythm">${sectionHead('02 / Ритм', 'У каждого диалога свой пульс', 'Дни разговоров, паузы и перемены темпа.')}<div class="panel"><div class="panel-head"><h3>Сообщения по дням</h3><span class="badge">${int(s.days)} дней</span></div>${dailyChart(data)}</div><div class="two-col">${trendPanel(data)}<div class="panel"><div class="panel-head"><h3>Моменты на шкале времени</h3></div><dl class="fact-list"><div><dt>Самая длинная серия активных дней</dt><dd>${int(s.longestStreakDays)} дн</dd></div><div><dt>Самая длинная пауза между сообщениями</dt><dd>${duration(finite(s.longestSilenceHours) ? s.longestSilenceHours * 3600 : null)}</dd></div><div><dt>Самый активный день</dt><dd>${peak ? `${esc(dateLabel(peak.date))} <span>${int(peak.total)} сообщений</span>` : '—'}</dd></div><div><dt>Медианная длительность сессии</dt><dd>${duration(finite(s.medianSessionMinutes) ? s.medianSessionMinutes * 60 : null)}</dd></div></dl><p class="panel-note">Пауза — время между двумя соседними сообщениями. Она не включает неизвестное время до и после экспорта. Длительность сессии — интервал от первого до последнего сообщения, включая паузы, а не время непрерывного разговора.</p></div></div></section>`;
}

function splitRow(label, a, b, names, maxTotal = null, note = '') {
  const total = num(a) + num(b);
  const denominator = maxTotal > 0 ? maxTotal : total;
  return `<div class="split-row"><div class="split-label"><span>${esc(label)}</span><strong>${int(total)}</strong></div><div class="split-track" aria-hidden="true"><span class="split-a" style="width:${clamp(ratio(num(a), denominator))}%"></span><span class="split-b" style="width:${clamp(ratio(num(b), denominator))}%"></span></div><p class="split-values"><span>${personName(names[0], 'Участник A')}: ${int(a)}</span>${names[1] ? `<span>${personName(names[1], 'Участник B')}: ${int(b)}</span>` : ''}</p>${note ? `<p class="panel-note">${esc(note)}</p>` : ''}</div>`;
}

function startPanel(data) {
  const participants = data.participants || [];
  const a = participants.find((p) => p.key === 'a'), b = participants.find((p) => p.key === 'b');
  const monthly = data.monthly || [];
  return `<div class="panel"><div class="panel-head"><h3>Кто возвращается к разговору</h3><span class="badge">Пауза от ${dec(data.meta?.sessionGapHours)} ч</span></div>${legend(participants)}${splitRow('Начала сессий за весь период', num(a?.starts), num(b?.starts), [a, b])}<p class="panel-note">Первое сообщение после долгой паузы — начало сессии. Первая видимая сессия исключена: её настоящее начало неизвестно.</p>${monthly.length ? `<h4 class="subheading">Как менялась инициатива по месяцам</h4><div class="monthly-starts">${monthly.map((m) => splitRow(monthLabel(m.month), m.startsA, m.startsB, [a, b], null, num(m.startsA) + num(m.startsB) < 5 ? 'Мало наблюдений: меньше 5 начал сессий.' : '')).join('')}</div>` : empty('Нет начал сессий, которые можно сравнить.')}</div>`;
}

function sensitivityPanel(data) {
  const participants = data.participants || [];
  const a = participants.find((p) => p.key === 'a'), b = participants.find((p) => p.key === 'b');
  const sensitivity = data.sensitivity || [];
  return `<div class="panel"><div class="panel-head"><h3>А если выбрать другую паузу?</h3></div><p class="panel-note">Правило разделения меняет число сессий и их инициаторов. Сравните несколько порогов перед выводами.</p>${sensitivity.length ? `<div class="table-scroll"><table class="metric-table sensitivity-table"><caption class="sr-only">Чувствительность анализа к порогу паузы</caption><thead><tr><th scope="col">Пауза</th><th scope="col">Начал</th><th scope="col">${personName(a, 'Участник A')}</th>${b ? `<th scope="col">${personName(b)}</th>` : ''}<th scope="col">Пишут оба</th></tr></thead><tbody>${sensitivity.map((row) => `<tr${num(row.hours) === num(data.meta?.sessionGapHours) ? ' class="is-selected"' : ''}><th scope="row">${dec(row.hours)} ч${num(row.hours) === num(data.meta?.sessionGapHours) ? '<span class="current-marker" aria-label="Выбранный порог"> •</span>' : ''}</th><td>${int(row.eligibleStarts)}</td><td>${int(row.a)} <span class="cell-note">${pct(ratio(num(row.a), num(row.eligibleStarts)))}</span></td>${b ? `<td>${int(row.b)} <span class="cell-note">${pct(ratio(num(row.b), num(row.eligibleStarts)))}</span></td>` : ''}<td>${pct(row.twoSidedPct)}</td></tr>`).join('')}</tbody></table></div>` : empty('Недостаточно данных для сравнения порогов.')}<p class="panel-note">«Пишут оба» — доля всех сессий с сообщениями двух участников. Точка отмечает выбранный порог.</p></div>`;
}

function monthlyResponsePanel(data) {
  const participants = data.participants || [];
  const monthly = data.monthly || [];
  return `<div class="panel monthly-response-panel"><div class="panel-head"><h3>Темп ответа по месяцам</h3></div><p class="panel-note">Медиана пауз при смене автора, только внутри сессий. Месяц определяется по дате ответа.</p>${monthly.length && participants.length ? `<div class="table-scroll"><table class="metric-table monthly-response-table"><caption class="sr-only">Медианное время ответа по месяцам</caption><thead><tr><th scope="col">Месяц</th>${participants.map((p) => `<th scope="col">${personName(p)}</th>`).join('')}</tr></thead><tbody>${monthly.map((m) => `<tr><th scope="row">${esc(monthLabel(m.month))}</th>${participants.map((p) => `<td>${duration(m[p.key === 'b' ? 'responseB' : 'responseA'])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="panel-note">Прочерк означает отсутствие измеренных переходов. Число ответов по месяцам может различаться.</p>` : empty('Нет месячных наблюдений для сравнения.')}</div>`;
}

function responsePanel(data) {
  const participants = data.participants || [];
  return `<div class="panel response-panel"><div class="panel-head"><h3>Темп ответа</h3><span class="badge">Внутри сессий</span></div><p class="panel-note">Считаем паузу от последнего сообщения одного автора до первого сообщения другого. Серия сообщений подряд считается одной репликой; переходы между сессиями исключены.</p><div class="response-grid">${participants.map((p) => `<article class="response-card person-${p.key === 'b' ? 'b' : 'a'}"><h4>${personName(p)}</h4><p class="response-primary">${duration(p.response?.medianSeconds)}</p><p class="stat-label">медианное время ответа</p><dl class="fact-list compact"><div><dt>90% ответов укладываются в</dt><dd>${duration(p.response?.p90Seconds)}</dd></div><div><dt>Ответов быстрее 5 минут</dt><dd>${num(p.response?.count) > 0 ? pct(p.response?.under5minPct) : '—'}</dd></div><div><dt>Измеренных переходов</dt><dd>${int(p.response?.count)}</dd></div></dl>${num(p.response?.count) < 10 ? '<p class="panel-note">Мало наблюдений: оценка может заметно меняться от одного ответа.</p>' : ''}</article>`).join('') || empty('Нет участников для сравнения.')}</div><p class="panel-note">Время ответа не равно времени прочтения. Сон, работа и занятость не видны в экспорте.</p></div>`;
}

function contributions(data) {
  const participants = data.participants || [];
  const rows = [
    ['Сообщения', (p) => int(p.messages)],
    ['Доля сообщений', (p) => pct(ratio(num(p.messages), num(data.summary?.messages)))],
    ['Слова', (p) => int(p.words)],
    ['Символы текста', (p) => int(p.characters)],
    ['Реплики подряд одного автора', (p) => int(p.turns)],
    ['Сообщений на реплику', (p) => num(p.turns) > 0 ? dec(num(p.messages) / p.turns) : '—'],
    ['Слов на сообщение', (p) => num(p.messages) > 0 ? dec(num(p.words) / p.messages) : '—'],
    ['Сообщения с вопросительным знаком', (p) => int(p.questions)],
    ['Сообщения со ссылками', (p) => int(p.links)],
    ['Ответы на конкретное сообщение', (p) => int(p.replies)],
    ['Пересланные сообщения', (p) => int(p.forwards)],
    ['Полученные реакции', (p) => int(p.reactionsReceived)],
    ['Дни с сообщениями автора', (p) => int(p.activeDays)],
    ['Отредактированные сообщения', (p) => int(p.edited)],
  ];
  return `<div class="panel"><div class="panel-head"><h3>Из чего складывается разговор</h3></div><div class="table-scroll"><table class="metric-table contributions-table"><caption class="sr-only">Вклад участников в переписку</caption><thead><tr><th scope="col">Показатель</th>${participants.map((p) => `<th scope="col">${personName(p)}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => `<tr><th scope="row">${esc(label)}</th>${participants.map((p) => `<td>${esc(get(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="panel-note">Реплика — серия сообщений одного автора подряд внутри сессии. Сообщений на реплику помогает увидеть, насколько участник дробит текст на отдельные отправки. Вопросительный знак не доказывает, что сообщение содержит вопрос.</p></div>`;
}

function dialogue(data) {
  return `<section class="report-section" id="dialogue">${sectionHead('03 / Диалог', 'Кто начинает, как отвечают', 'Инициатива зависит от выбранного порога тишины.')}<div class="two-col">${startPanel(data)}<div class="dialogue-side-panels">${sensitivityPanel(data)}${monthlyResponsePanel(data)}</div></div>${responsePanel(data)}${contributions(data)}</section>`;
}

function heatmap(data) {
  const cells = data.heatmap || [];
  const bySlot = new Map(cells.map((cell) => [`${cell.day}:${cell.hour}`, cell]));
  const max = Math.max(0, ...cells.map((cell) => num(cell.total)));
  if (!max) return empty('Нет сообщений для календаря активности.');
  const top = 37, left = 54, cellW = 37, cellH = 32, gap = 3;
  const width = left + cellW * 24 + 18, height = top + cellH * 7 + 31;
  const color = (value) => {
    if (!value) return '#f0f4f6';
    const level = 0.12 + 0.88 * Math.sqrt(value / max);
    const low = [228, 243, 241], high = [20, 125, 120];
    return `rgb(${low.map((component, i) => Math.round(component + (high[i] - component) * level)).join(',')})`;
  };
  let rects = '';
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const cell = bySlot.get(`${day}:${hour}`) || { total: 0, a: 0, b: 0 };
      rects += `<rect x="${left + hour * cellW}" y="${top + day * cellH}" width="${cellW - gap}" height="${cellH - gap}" rx="4" fill="${color(num(cell.total))}"><title>${esc(`${DAY_NAMES[day]}, ${hour}:00–${hour}:59 · ${int(cell.total)} сообщений`)}</title></rect>`;
    }
  }
  const peak = cells.reduce((best, cell) => num(cell.total) > num(best.total) ? cell : best, cells[0]);
  const peakText = `${DAY_NAMES[peak.day] || ''}, ${int(peak.hour)}:00–${int(peak.hour)}:59`;
  const rowLabels = WEEKDAYS.map((label, day) => `<text x="${left - 15}" y="${top + day * cellH + 20}" text-anchor="end" fill="${COLORS.muted}" font-size="13">${label}</text>`).join('');
  const columns = Array.from({ length: 8 }, (_, i) => i * 3).map((hour) => `<text x="${left + hour * cellW + (cellW - gap) / 2}" y="21" text-anchor="middle" fill="${COLORS.muted}" font-size="13">${String(hour).padStart(2, '0')}:00</text>`).join('');
  return `<p class="heatmap-summary">Больше всего сообщений в слоте <strong>${esc(peakText)}</strong>: ${int(peak.total)} за весь период.</p><p class="chart-scroll-hint">График шире экрана · прокрутите вправо →</p><div class="chart-wrap"><svg class="chart wide-chart heatmap-chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="heatmap-title heatmap-desc"><title id="heatmap-title">Активность по дням недели и часам</title><desc id="heatmap-desc">${esc(`Каждая клетка — суммарное количество сообщений обоих участников в один час одного дня недели за весь период. Чем темнее клетка, тем больше сообщений. Максимум: ${peakText}, ${int(peak.total)} сообщений.`)}</desc><g font-family="system-ui,sans-serif">${columns}${rowLabels}${rects}<text x="${left}" y="${height - 4}" fill="${COLORS.muted}" font-size="12">Меньше</text>${Array.from({ length: 5 }, (_, i) => `<rect x="${left + 65 + i * 23}" y="${height - 18}" width="20" height="16" rx="3" fill="${color(max * i / 4)}"/>`).join('')}<text x="${left + 190}" y="${height - 4}" fill="${COLORS.muted}" font-size="12">Больше</text></g></svg></div><p class="panel-note">Часовой пояс: ${esc(data.meta?.timezone === 'export' ? 'Как в экспорте Telegram' : data.meta?.timezone || '—')}. Это сумма за весь период, а не среднее за неделю.</p><details class="data-details"><summary>Таблица активности по часам</summary><div class="table-scroll"><table class="metric-table heatmap-table"><caption class="sr-only">Сообщения по дню недели и часу</caption><thead><tr><th scope="col">День</th>${Array.from({ length: 24 }, (_, h) => `<th scope="col">${h}:00</th>`).join('')}</tr></thead><tbody>${WEEKDAYS.map((day, d) => `<tr><th scope="row">${day}</th>${Array.from({ length: 24 }, (_, h) => `<td>${int(bySlot.get(`${d}:${h}`)?.total)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

function mediaPanel(data) {
  const participants = data.participants || [];
  const a = participants.find((p) => p.key === 'a'), b = participants.find((p) => p.key === 'b');
  const active = MEDIA.filter(([key]) => num(a?.media?.[key]) + num(b?.media?.[key]) > 0);
  const max = Math.max(0, ...active.map(([key]) => num(a?.media?.[key]) + num(b?.media?.[key])));
  return `<div class="panel"><div class="panel-head"><h3>Не только текст</h3><span class="badge">${int(active.reduce((sum, [key]) => sum + num(a?.media?.[key]) + num(b?.media?.[key]), 0))} вложений</span></div>${active.length ? `${legend(participants)}<div class="media-rows">${active.map(([key, label]) => splitRow(label, a?.media?.[key], b?.media?.[key], [a, b], max)).join('')}</div>` : empty('Медиа и вложений в выбранном периоде нет.')}<div class="media-duration-grid">${participants.map((p) => `<div class="media-duration"><h4>${personName(p)}</h4><p><strong>${duration(num(p.voiceSeconds))}</strong> голосовых</p><p><strong>${duration(num(p.videoSeconds))}</strong> видео</p></div>`).join('')}</div><p class="panel-note">Длительность суммируется только там, где она сохранена в JSON. Отсутствующие метаданные могут уменьшать итог.</p></div>`;
}

function habits(data) {
  return `<section class="report-section" id="habits">${sectionHead('04 / Привычки', 'Когда и чем вы общаетесь', 'Узнаваемый ритм без чтения содержимого.')}<div class="panel"><div class="panel-head"><h3>Часы на связи</h3><span class="badge">7 дней × 24 часа</span></div>${heatmap(data)}</div>${mediaPanel(data)}</section>`;
}

function hasLexicon(data) {
  return data.meta?.includeLexicon === true && data.lexicon && typeof data.lexicon === 'object';
}

function lexiconPanel(data, kind, limit) {
  const participants = data.participants || [];
  const words = kind === 'words';
  const rows = (Array.isArray(data.lexicon[kind]) ? data.lexicon[kind] : []).slice(0, limit);
  const description = words
    ? `Частота слов, ${data.lexicon.excludedStopWords ? 'без частых служебных слов' : 'включая служебные слова'}, формы не объединены; число вхождений, включая пересылки.`
    : 'Эмодзи в тексте; реакции и стикеры не учитываются.';
  return `<div class="panel"><div class="panel-head"><h3>${words ? 'Частые слова' : 'Частые эмодзи'}</h3><span class="badge">До ${int(limit)} ${words ? 'слов' : 'эмодзи'}</span></div>
    <p class="panel-note">${esc(description)}</p>
    ${rows.length ? `<div class="table-scroll"><table class="metric-table lexicon-${kind}-table">
      <caption class="sr-only">${words ? 'Частота слов по участникам' : 'Частота эмодзи по участникам'}</caption>
      <thead><tr><th scope="col">${words ? 'Слово' : 'Эмодзи'}</th>${participants.map((p) => `<th scope="col">${personName(p)}</th>`).join('')}<th scope="col">Всего</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><th scope="row">${esc(row.term)}</th>${participants.map((p) => `<td>${int(row[p.key === 'b' ? 'b' : 'a'])}</td>`).join('')}<td>${int(row.total)}</td></tr>`).join('')}</tbody>
      </table></div>` : empty(words ? 'Слов, подходящих под правила подсчёта, не найдено.' : 'Эмодзи в тексте сообщений не найдены.')}
    </div>`;
}

function lexicon(data) {
  const limit = Math.max(1, Math.min(24, Math.floor(num(data.lexicon.limit) || 24)));
  const minimumLength = Math.max(1, Math.floor(num(data.lexicon.minimumWordLength) || 3));
  return `<section class="report-section" id="words">
    ${sectionHead('05 / Слова', 'Слова и эмодзи', 'Частоты из текста переписки. Подсчёт выполнен локально.')}
    <p class="panel-note">Слова длиной от ${int(minimumLength)} символов. Этот раздел сохраняет выбранные слова и эмодзи в HTML-отчёте.</p>
    <div class="two-col">${lexiconPanel(data, 'words', limit)}${lexiconPanel(data, 'emojis', limit)}</div>
  </section>`;
}

function methodology(data) {
  const q = data.quality || {};
  const meta = data.meta || {};
  const lexical = hasLexicon(data);
  const privacy = lexical ? 'В отчёт включены выбранные частые слова и эмодзи из переписки с числом вхождений. Полные тексты сообщений, идентификаторы пользователей, ссылки из переписки и пути к вложениям в отчёт не включаются.' : 'Здесь только агрегаты: тексты сообщений, идентификаторы пользователей, ссылки из переписки и пути к вложениям в отчёт не включаются.';
  const quality = [['Записей в JSON', q.totalRecords], ['Корректных сообщений', q.validMessages], ['Служебных событий', q.serviceMessages], ['Некорректных записей', q.invalidMessages], ['Повторов', q.duplicates], ['За пределами фильтра', q.outsideRange]];
  return `<section class="report-section" id="method">${sectionHead(`${lexical ? '06' : '05'} / Прозрачность`, 'Что стоит за цифрами', 'Все правила открыты. Ни один индекс не объясняет чувства.')}<div class="panel"><dl class="report-meta"><div><dt>Период данных</dt><dd>${esc(dateLabel(meta.startDate, true))} — ${esc(dateLabel(meta.endDate, true))}</dd></div><div><dt>Часовой пояс</dt><dd>${esc(meta.timezone === 'export' ? 'Как в экспорте Telegram' : meta.timezone || '—')}</dd></div><div><dt>Пауза между сессиями</dt><dd>${dec(meta.sessionGapHours)} ч</dd></div><div><dt>Имена участников</dt><dd>${meta.anonymize ? 'Обезличены' : 'Из экспорта'}</dd></div></dl><details class="method-details" open><summary>Как читать этот отчёт</summary><ol class="method-list"><li><strong>Сессия общения.</strong> Новая сессия начинается после паузы не меньше ${dec(meta.sessionGapHours)} ч. Её инициатор — автор первого сообщения. Первую видимую сессию не учитываем в статистике инициативы.</li><li><strong>Ответ.</strong> Измеряем время между последним сообщением одного автора и первым другого внутри одной сессии. Медиана делит измеренные паузы пополам; 90-й перцентиль — длительность, в которую укладывается примерно 90% этих пауз.</li><li><strong>Баланс.</strong> Сравниваем количество сообщений, а не вклад человека в отношения. Длина реплик, стиль переписки и недостающие фрагменты влияют на результат.</li><li><strong>Динамика.</strong> Сравниваем последние 7 полных дней с предыдущими 28 полными днями. Первый и последний календарный день экспорта исключаем из сравнения. Это описательная эвристика без проверки статистической значимости.</li><li><strong>Календарь.</strong> Дни без сообщений входят в период. Для календарных графиков используется выбранный часовой пояс; длительности считаются по реальному времени сообщений.</li><li><strong>Границы данных.</strong> Первый и последний дни могут быть неполными. Удалённые сообщения, звонки вне чата и общение в других местах в анализ не попадают. Реакции и метаданные видны только в объёме экспорта.</li><li><strong>Приватность отчёта.</strong> ${esc(privacy)} При отключённом обезличивании сохраняются имена участников.</li></ol></details><h3 class="subheading">Качество исходных данных</h3><div class="quality-grid">${quality.map(([label, value]) => `<div class="quality-item"><strong>${int(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>${(q.warnings || []).length ? `<ul class="quality-warnings">${q.warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>` : '<p class="panel-note">Дополнительных замечаний при обработке не обнаружено.</p>'}</div></section>`;
}

/** Render a self-contained report fragment from aggregates and optional word frequencies. */
export function renderReport(data, { mode = 'full' } = {}) {
  if (!data || typeof data !== 'object') throw new TypeError('Для отчёта нужны результаты анализа.');
  if (!['full', 'overview', 'rhythm', 'dialogue'].includes(mode)) throw new TypeError('Неизвестный режим отчёта.');
  const output = [overview(data)];
  if (mode === 'full' || mode === 'rhythm') output.push(rhythm(data));
  if (mode === 'full' || mode === 'dialogue') output.push(dialogue(data));
  if (mode === 'full') output.push(habits(data));
  if (hasLexicon(data)) output.push(lexicon(data));
  output.push(methodology(data));
  return `<div class="report-content report-mode-${mode}">${output.join('')}</div>`;
}
