import { renderExplorer } from './explore.js';
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
  const summary=data.summary||{},people=data.participants||[];
  return `<section class="report-section" id="overview">${sectionHead('01 / Кто и сколько', people.length===2?'Два человека. Один диалог.':'Ваш диалог в цифрах', 'Вклад каждого — в сообщениях, словах и репликах.')}<div class="overview-strip"><span><strong>${int(summary.messages)}</strong> сообщений всего</span><span><strong>${int(summary.days)}</strong> дней в периоде</span><span><strong>${int(summary.activeDays)}</strong> дней с перепиской</span></div><div class="people-grid">${people.map(p=>`<article class="person-card person-card-${p.key}"><div class="person-top"><h3>${personName(p)}</h3><span>${pct(ratio(p.messages,summary.messages))} переписки</span></div><p class="person-volume">${int(p.messages)}<span>сообщений</span></p><div class="person-share"><span style="width:${clamp(ratio(p.messages,summary.messages))}%"></span></div><div class="person-facts"><div><b>${int(p.words)}</b><span>слов</span></div><div><b>${int(p.turns)}</b><span>реплик</span></div><div><b>${int(p.starts)}</b><span>начал диалога</span></div><div><b>${duration(p.response?.medianSeconds)}</b><span>медиана ответа</span></div></div></article>`).join('')||empty('В выбранном периоде нет участников.')}</div><p class="panel-note">Начало диалога — первое сообщение после паузы от ${dec(data.meta?.sessionGapHours)} ч. Реплика объединяет сообщения одного автора подряд. Медиана ответа — только внутри сессий.</p>${(data.insights||[]).length?`<div class="insight-grid">${data.insights.slice(0,2).map(item=>`<article class="insight-card tone-${['neutral','positive','attention'].includes(item.tone)?item.tone:'neutral'}"><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`).join('')}</div>`:''}</section>`;
}

function rhythm(data,explorerPrefs={}) {
  const s=data.summary||{};
  return `<section class="report-section" id="rhythm">${sectionHead('02 / Ритм', 'От общей картины — к деталям', 'Переключайте представление. Базовое окно — 7 дней.')}${renderExplorer(data,explorerPrefs)}<div class="rhythm-footnotes"><span><b>${int(s.longestStreakDays)} дней</b> — самая длинная серия общения</span><span><b>${duration(finite(s.longestSilenceHours)?s.longestSilenceHours*3600:null)}</b> — самая длинная наблюдаемая пауза</span><span><b>${duration(finite(s.medianSessionMinutes)?s.medianSessionMinutes*60:null)}</b> — медианный интервал сессии, включая паузы</span></div></section>`;
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
  return `<section class="report-section" id="method">${sectionHead(`${lexical ? '06' : '05'} / Прозрачность`, 'Что стоит за цифрами', 'Правила расчёта, границы данных и пояснения.')}<div class="panel"><dl class="report-meta"><div><dt>Период данных</dt><dd>${esc(dateLabel(meta.startDate, true))} — ${esc(dateLabel(meta.endDate, true))}</dd></div><div><dt>Часовой пояс</dt><dd>${esc(meta.timezone === 'export' ? 'Как в экспорте Telegram' : meta.timezone || '—')}</dd></div><div><dt>Пауза между сессиями</dt><dd>${dec(meta.sessionGapHours)} ч</dd></div><div><dt>Имена участников</dt><dd>${meta.anonymize ? 'Обезличены' : 'Имена или заданные подписи'}</dd></div></dl><details class="method-details" open><summary>Как читать этот отчёт</summary><ol class="method-list"><li><strong>Сессия общения.</strong> Новая сессия начинается после паузы не меньше ${dec(meta.sessionGapHours)} ч. Её инициатор — автор первого сообщения. Первую видимую сессию не учитываем в статистике инициативы.</li><li><strong>Ответ.</strong> Измеряем время между последним сообщением одного автора и первым другого внутри одной сессии. Медиана делит измеренные паузы пополам; 90-й перцентиль — длительность, в которую укладывается примерно 90% этих пауз.</li><li><strong>Баланс.</strong> Сравниваем количество сообщений, а не вклад человека в отношения. Длина реплик, стиль переписки и недостающие фрагменты влияют на результат.</li><li><strong>Динамика.</strong> По умолчанию сравниваем последние 7 полных дней с предыдущими 28. Переключатель позволяет выбрать 14 к 28 или 28 к 28 дням. Сглаживание графика меняется отдельно: 1, 7, 14 или 28 дней. Первый и последний календарный день экспорта исключаем из сравнения. Это описательная эвристика без проверки статистической значимости.</li><li><strong>Календарь.</strong> Дни без сообщений входят в период. Для календарных графиков используется выбранный часовой пояс; длительности считаются по реальному времени сообщений.</li><li><strong>Границы данных.</strong> Первый и последний дни могут быть неполными. Удалённые сообщения, звонки вне чата и общение в других местах в анализ не попадают. Реакции и метаданные видны только в объёме экспорта.</li><li><strong>Приватность отчёта.</strong> ${esc(privacy)} При отключённом обезличивании сохраняются имена участников.</li></ol></details><h3 class="subheading">Качество исходных данных</h3><div class="quality-grid">${quality.map(([label, value]) => `<div class="quality-item"><strong>${int(value)}</strong><span>${esc(label)}</span></div>`).join('')}</div>${(q.warnings || []).length ? `<ul class="quality-warnings">${q.warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul>` : '<p class="panel-note">Дополнительных замечаний при обработке не обнаружено.</p>'}</div></section>`;
}

/** Render a self-contained report fragment from aggregates and optional word frequencies. */
export function renderReport(data, { mode = 'full', explorerPrefs = {} } = {}) {
  if (!data || typeof data !== 'object') throw new TypeError('Для отчёта нужны результаты анализа.');
  if (!['full', 'overview', 'rhythm', 'dialogue'].includes(mode)) throw new TypeError('Неизвестный режим отчёта.');
  const output = [overview(data)];
  if (mode === 'full' || mode === 'rhythm') output.push(rhythm(data,explorerPrefs));
  if (mode === 'full' || mode === 'dialogue') output.push(dialogue(data));
  if (mode === 'full') output.push(habits(data));
  if (hasLexicon(data)) output.push(lexicon(data));
  output.push(methodology(data));
  return `<div class="report-content report-mode-${mode}">${output.join('')}</div>`;
}
