/** Local, dependency-free descriptive analytics. Lexical content is included only by explicit opt-in. */
export const DEFAULT_OPTIONS = Object.freeze({
  sessionGapHours: 6,
  timezone: 'export',
  startDate: '',
  endDate: '',
  anonymize: true,
  includeLexicon: false,
  participantNames: Object.freeze({}),
});

const DAY = 86400000;
const MAX_DAYS = 36600;
const MEDIA = ['photo', 'video_message', 'voice_message', 'video_file', 'sticker', 'animation', 'audio_file', 'file', 'other'];
const round = (value, digits = 2) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const percent = (part, whole) => whole ? round(100 * part / whole) : 0;
const LEXICON_LIMIT = 24;
const STOP_WORDS = new Set(`
а без более больше был была были было быть вам вами вас ваш ваша ваше ваши весь вся всё все всего всех во вот вы где да даже для до его ее её если есть еще ещё же за зачем здесь и из или им ими их к как какая какие какой когда кто ли либо мне мною мной мог могут может можно мои мой моя моё мы на над надо нам нами нас наш наша наше наши не него нее неё ней нем нём нет ни них ничего но ну о об один она они оно он опять от перед по под пока после потом почему потому при про раз разве сам сама сами своё свой свои себе себя сейчас со совсем так такая также такие такой там те тебя тем теперь то того тоже той только том тот тут ты у уже чем чего чей через что чтобы чтоб чья эта эти это эту я тебе тобой тебе вами нам нам-то
about above after again against ain all also am an and any are aren aren't as at be because been before being below between both but by can cannot can't could couldn couldn't did didn didn't do does doesn doesn't doing don don't down during each few for from further get got had hadn hadn't has hasn hasn't have haven haven't having he her here hers herself him himself his how i if in into is isn isn't it its it's itself just ll me might mightn mightn't more most must mustn mustn't my myself need needn needn't no nor not now of off on once only or other our ours ourselves out over own re same shan shan't she she's should shouldn shouldn't should've so some such than that that'll that's the their theirs them themselves then there there's these they this those through to too under until up us ve very was wasn wasn't we were weren weren't what what's when where which while who whom why will with won won't would wouldn wouldn't you you'd you'll you're you've your yours yourself yourselves
`.trim().split(/\s+/u));

function countLexicon(text, accumulator, segmenter) {
  // Strip URLs and email addresses before tokenization; hidden entity targets are never read.
  const cleaned = /[.@]|:\/\//u.test(text) ? text.replace(/(?:https?|ftp|tg):\/\/[^\s<>"']+|mailto:[^\s<>"']+|www\.[^\s<>"']+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}(?::\d+)?(?:[/?#][^\s<>"']*)?/giu, ' ') : text;
  for (const match of cleaned.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu)) {
    const term = match[0].toLowerCase().normalize('NFC');
    if (!/\p{L}/u.test(term) || STOP_WORDS.has(term)) continue;
    let length = 0;
    for (const character of term) { length++; if (length >= 3) break; }
    if (length < 3) continue;
    accumulator.words.set(term, (accumulator.words.get(term) || 0) + 1);
  }
  for (const { segment } of segmenter.segment(cleaned)) {
    if (/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20e3]/u.test(segment)) {
      accumulator.emojis.set(segment, (accumulator.emojis.get(segment) || 0) + 1);
    }
  }
}

function lexiconResult(byIdentity, identityMap) {
  const byKey = { a: { words: new Map(), emojis: new Map() }, b: { words: new Map(), emojis: new Map() } };
  for (const [identity, counts] of byIdentity) byKey[identityMap.get(identity)] = counts;
  const topTerms = (field) => {
    const a = byKey.a[field], b = byKey.b[field], top = [];
    const compare = (left, right) => right.total - left.total || (left.term < right.term ? -1 : left.term > right.term ? 1 : 0);
    const insert = (term) => {
      const row = { term, a: a.get(term) || 0, b: b.get(term) || 0, total: (a.get(term) || 0) + (b.get(term) || 0) };
      let index = 0;
      while (index < top.length && compare(top[index], row) <= 0) index++;
      if (index < LEXICON_LIMIT) {
        top.splice(index, 0, row);
        if (top.length > LEXICON_LIMIT) top.pop();
      }
    };
    for (const term of a.keys()) insert(term);
    for (const term of b.keys()) if (!a.has(term)) insert(term);
    return top;
  };
  return { words: topTerms('words'), emojis: topTerms('emojis'), excludedStopWords: true, minimumWordLength: 3, limit: LEXICON_LIMIT };
}

/** Telegram text is a string or an array of strings and formatted text entities. */
export function flattenText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return value && typeof value.text === 'string' ? value.text : '';
  return value.map((part) => typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : '').join('');
}

function utcMs(year, month, day, hour = 0, minute = 0, second = 0) {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = utcMs(y, m, d);
  const date = new Date(ms);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d ? ms : null;
}

function parseWallDate(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!m || parseDay(m[1]) === null) return null;
  const hour = Number(m[2]), minute = Number(m[3]), second = Number(m[4]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  let offsetMinutes = null;
  if (m[6]) {
    if (m[6] === 'Z') offsetMinutes = 0;
    else {
      const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(m[6]);
      if (Number(offset[2]) > 23 || Number(offset[3]) > 59) return null;
      offsetMinutes = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));
    }
  }
  return { date: m[1], hour, minute, second, millisecond: Number((m[5] || '').padEnd(3, '0')), offsetMinutes };
}

function makeFormatter(timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
}

function calendarAt(epoch, formatter) {
  const parts = {};
  for (const part of formatter.formatToParts(new Date(epoch))) if (part.type !== 'literal') parts[part.type] = part.value;
  return {
    date: `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

// A naive timestamp has no globally determined instant. For a selected IANA zone,
// resolve local wall time in that zone; an ambiguous fall-back hour uses its first occurrence.
function wallToEpoch(wall, formatter) {
  const nominal = parseDay(wall.date) + wall.hour * 3600000 + wall.minute * 60000 + wall.second * 1000;
  if (wall.offsetMinutes !== null) return nominal - wall.offsetMinutes * 60000 + wall.millisecond;
  if (!formatter) return nominal + wall.millisecond;
  const offsets = new Set();
  for (const delta of [-DAY, 0, DAY]) {
    const sample = nominal + delta;
    const local = calendarAt(sample, formatter);
    offsets.add(parseDay(local.date) + local.hour * 3600000 + local.minute * 60000 + local.second * 1000 - sample);
  }
  const matches = [...offsets].map((offset) => nominal - offset).filter((candidate) => {
    const local = calendarAt(candidate, formatter);
    return local.date === wall.date && local.hour === wall.hour && local.minute === wall.minute && local.second === wall.second;
  });
  return matches.length ? Math.min(...matches) + wall.millisecond : null;
}

function validateOptions(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Настройки должны быть объектом.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_OPTIONS, key)) throw new Error(`Неизвестная настройка: ${key}.`);
  const options = { ...DEFAULT_OPTIONS, ...input };
  if (typeof options.sessionGapHours !== 'number' || !Number.isFinite(options.sessionGapHours) || options.sessionGapHours <= 0 || options.sessionGapHours > 168) {
    throw new Error('Пауза между сеансами должна быть числом больше 0 и не больше 168 часов.');
  }
  if (typeof options.anonymize !== 'boolean') throw new Error('Настройка анонимизации должна быть true или false.');
  if (typeof options.includeLexicon !== 'boolean') throw new Error('Настройка анализа слов и эмодзи должна быть true или false.');
  if (typeof options.timezone !== 'string' || !options.timezone.trim()) throw new Error('Укажите часовую зону: export, UTC или имя IANA.');
  let formatter = null;
  if (options.timezone !== 'export') {
    try { formatter = makeFormatter(options.timezone); }
    catch { throw new Error('Неизвестная часовая зона. Используйте export, UTC или имя IANA, например Europe/Moscow.'); }
  }
  for (const field of ['startDate', 'endDate']) {
    if (options[field] !== '' && parseDay(options[field]) === null) throw new Error('Границы периода должны быть настоящими датами в формате ГГГГ-ММ-ДД.');
  }
  if (options.startDate && options.endDate && options.startDate > options.endDate) throw new Error('Начало периода не может быть позже его конца.');
  if (options.startDate && options.endDate && (parseDay(options.endDate) - parseDay(options.startDate)) / DAY + 1 > MAX_DAYS) {
    throw new Error('Слишком длинный период: выберите не больше 100 лет.');
  }
  if (!options.participantNames || typeof options.participantNames !== 'object' || Array.isArray(options.participantNames) || Object.entries(options.participantNames).some(([key,value]) => !['a','b'].includes(key) || typeof value !== 'string' || value.length > 80)) throw new Error('Подписи участников: строки до 80 символов для a и b.');
  return { options, formatter };
}

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position), weight = position - low;
  return round(sorted[low] * (1 - weight) + sorted[Math.ceil(position)] * weight);
}

function responseSummary(values) {
  return {
    count: values.length,
    medianSeconds: quantile(values, 0.5),
    p90Seconds: quantile(values, 0.9),
    under5minPct: values.length ? percent(values.filter((value) => value < 300).length, values.length) : null,
  };
}

function mediaType(message) {
  if (message.photo !== undefined && message.photo !== null) return 'photo';
  if (typeof message.media_type === 'string') return MEDIA.includes(message.media_type) ? message.media_type : 'other';
  if (message.file !== undefined && message.file !== null) return 'file';
  if (['contact_information', 'location_information', 'venue', 'poll', 'game', 'invoice'].some((key) => message[key] != null)) return 'other';
  return null;
}

function hasLink(message, text) {
  if (/(?:https?:\/\/|www\.|\bt\.me\/)[^\s]+/iu.test(text)) return true;
  return [message.text, message.text_entities].some((entities) => Array.isArray(entities) && entities.some((entity) =>
    entity && typeof entity === 'object' && ['link', 'text_link', 'url'].includes(entity.type)));
}

function measure(message, lexicalCounts = null, segmenter = null) {
  const text = flattenText(message.text);
  if (lexicalCounts) countLexicon(text, lexicalCounts, segmenter);
  let words = 0, characters = 0;
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)) words++;
  for (const character of text) characters++;
  const media = mediaType(message);
  const duration = typeof message.duration_seconds === 'number' && Number.isFinite(message.duration_seconds) && message.duration_seconds > 0 ? message.duration_seconds : 0;
  const reactions = Array.isArray(message.reactions) ? message.reactions.reduce((sum, reaction) => {
    const count = reaction && reaction.count;
    return sum + (typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? count : 0);
  }, 0) : 0;
  return {
    words, characters,
    questions: /[?？]/u.test(text) ? 1 : 0,
    links: hasLink(message, text) ? 1 : 0,
    forwards: message.forwarded_from != null && message.forwarded_from !== '' ? 1 : 0,
    replies: message.reply_to_message_id != null && message.reply_to_message_id !== '' ? 1 : 0,
    reactionsReceived: reactions,
    edited: (message.edited != null && message.edited !== '') || (message.edited_unixtime != null && message.edited_unixtime !== '') ? 1 : 0,
    media,
    voiceSeconds: media === 'voice_message' ? duration : 0,
    videoSeconds: ['video_message', 'video_file'].includes(media) ? duration : 0,
  };
}

function makeParticipant(key, name) {
  return {
    key, name, messages: 0, words: 0, characters: 0, questions: 0, links: 0, forwards: 0,
    replies: 0, reactionsReceived: 0, edited: 0,
    media: Object.fromEntries(MEDIA.map((type) => [type, 0])),
    voiceSeconds: 0, videoSeconds: 0, activeDays: 0, nightMessages: 0,
    starts: 0, turns: 0, response: responseSummary([]), unansweredSessions: 0,
  };
}

function groupSessions(messages, hours, collectResponses = false) {
  const groups = [];
  const responses = { a: [], b: [] };
  const monthlyResponses = new Map();
  const turns = { a: 0, b: 0 };
  const threshold = hours * 3600000;
  let current = null, previous = null;
  for (const message of messages) {
    if (!current || message.epoch - previous.epoch >= threshold) {
      current = { date: message.date, starter: message.key, messages: 0, start: message.epoch, end: message.epoch, seen: new Set(), lastKey: message.key };
      groups.push(current);
      turns[message.key]++;
    } else if (message.key !== previous.key) {
      turns[message.key]++;
      if (collectResponses) {
        const seconds = (message.epoch - previous.epoch) / 1000;
        responses[message.key].push(seconds);
        const month = message.date.slice(0, 7);
        if (!monthlyResponses.has(month)) monthlyResponses.set(month, { a: [], b: [] });
        monthlyResponses.get(month)[message.key].push(seconds);
      }
    }
    current.messages++;
    current.end = message.epoch;
    current.seen.add(message.key);
    current.lastKey = message.key;
    previous = message;
  }
  return { groups, responses, monthlyResponses, turns };
}

function trendFor(daily) {
  const excludedBoundaryDays = Math.min(daily.length, 2);
  const complete = daily.slice(1, Math.max(1, daily.length - 1));
  const comparisonDays = Math.min(7, complete.length);
  const baselineDays = Math.min(28, Math.max(0, complete.length - 7));
  const unavailable = { available: false, previousMean: null, currentMean: null, changePct: null, zScore: null, direction: 'insufficient', baselineDays, comparisonDays, excludedBoundaryDays };
  if (complete.length < 35) return unavailable;
  const current = complete.slice(-7).map((day) => day.total);
  const previous = complete.slice(-35, -7).map((day) => day.total);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const currentMean = mean(current), previousMean = mean(previous);
  const changePct = previousMean ? 100 * (currentMean - previousMean) / previousMean : null;
  const standardDeviation = Math.sqrt(previous.reduce((sum, value) => sum + (value - previousMean) ** 2, 0) / (previous.length - 1));
  const weeklyDifference = Math.abs(currentMean - previousMean) * 7;
  const changed = weeklyDifference >= 20 && (previousMean === 0 ? currentMean > 0 : Math.abs(changePct) >= 50);
  return {
    available: true, previousMean: round(previousMean), currentMean: round(currentMean),
    changePct: changePct === null ? null : round(changePct),
    zScore: standardDeviation ? round((currentMean - previousMean) / standardDeviation) : null,
    direction: changed ? currentMean > previousMean ? 'up' : 'down' : 'stable',
    baselineDays: 28, comparisonDays: 7, excludedBoundaryDays,
  };
}

/** Analyze one Telegram Desktop personal_chat JSON. Optional lexical aggregates require explicit opt-in. */
export function analyzeExport(input, settings = {}, onParticipants = null) {
  const { options, formatter } = validateOptions(settings);
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.type !== 'personal_chat' || !Array.isArray(input.messages)) {
    throw new Error('Нужен JSON одной личной переписки Telegram (type: personal_chat, messages). Группы и полный архив аккаунта пока не поддерживаются.');
  }
  const quality = { totalRecords: input.messages.length, validMessages: 0, serviceMessages: 0, invalidMessages: 0, duplicates: 0, outsideRange: 0, warnings: [] };
  const normalized = [];
  const lexicalByIdentity = options.includeLexicon ? new Map() : null;
  if (options.includeLexicon && typeof Intl.Segmenter !== 'function') throw new Error('Для анализа слов и эмодзи нужен современный браузер с поддержкой Intl.Segmenter.');
  const segmenter = options.includeLexicon ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
  const seenIds = new Set();
  let fallbackDates = 0, missingExportDates = 0, fallbackNames = 0;
  const utcFormatter = options.timezone === 'export' ? makeFormatter('UTC') : null;
  for (let index = 0; index < input.messages.length; index++) {
    const raw = input.messages[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { quality.invalidMessages++; continue; }
    if (raw.type === 'service') { quality.serviceMessages++; continue; }
    if (raw.type !== 'message') { quality.invalidMessages++; continue; }
    const messageId = (typeof raw.id === 'string' && raw.id !== '') || typeof raw.id === 'number' && Number.isFinite(raw.id) ? String(raw.id) : null;
    if (messageId !== null && seenIds.has(messageId)) { quality.duplicates++; continue; }
    const name = typeof raw.from === 'string' && raw.from.trim() ? raw.from.trim() : '';
    const hasFromId = (typeof raw.from_id === 'string' && raw.from_id.trim() !== '') || typeof raw.from_id === 'number' && Number.isFinite(raw.from_id);
    if (!hasFromId && !name) { quality.invalidMessages++; continue; }
    const identity = hasFromId ? `id:${String(raw.from_id)}` : `name:${name}`;
    const wall = raw.date == null ? null : parseWallDate(raw.date);
    if (raw.date != null && !wall) { quality.invalidMessages++; continue; }
    let epoch;
    if (raw.date_unixtime != null) {
      const unix = raw.date_unixtime;
      if (!['string', 'number'].includes(typeof unix) || typeof unix === 'string' && !/^-?\d+(?:\.\d+)?$/.test(unix)) { quality.invalidMessages++; continue; }
      epoch = Number(unix) * 1000;
      if (!Number.isFinite(epoch) || Math.abs(epoch) > 8640000000000000 || new Date(epoch).getUTCFullYear() < 1 || new Date(epoch).getUTCFullYear() > 9999) { quality.invalidMessages++; continue; }
    } else {
      if (!wall) { quality.invalidMessages++; continue; }
      epoch = wallToEpoch(wall, formatter);
      if (epoch === null) { quality.invalidMessages++; continue; }
      fallbackDates++;
    }
    let calendar;
    try {
      calendar = options.timezone === 'export' ? wall || calendarAt(epoch, utcFormatter) : calendarAt(epoch, formatter);
    } catch { quality.invalidMessages++; continue; }
    if (parseDay(calendar.date) === null) { quality.invalidMessages++; continue; }
    if (options.timezone === 'export' && !wall) missingExportDates++;
    if (!hasFromId) fallbackNames++;
    if (messageId !== null) seenIds.add(messageId);
    let lexicalCounts = null;
    if (options.includeLexicon && (!options.startDate || calendar.date >= options.startDate) && (!options.endDate || calendar.date <= options.endDate)) {
      if (!lexicalByIdentity.has(identity)) lexicalByIdentity.set(identity, { words: new Map(), emojis: new Map() });
      lexicalCounts = lexicalByIdentity.get(identity);
    }
    normalized.push({ epoch, date: calendar.date, hour: calendar.hour, identity, name, index, counts: measure(raw, lexicalCounts, segmenter) });
    quality.validMessages++;
  }
  normalized.sort((a, b) => a.epoch - b.epoch || a.index - b.index);
  const identityMap = new Map();
  const participants = [];
  const profiles = [];
  for (const message of normalized) {
    if (!identityMap.has(message.identity)) {
      if (participants.length === 2) throw new Error('В выгрузке больше двух авторов. Выберите личную переписку 1:1; для групп анализ пока недоступен.');
      const key = participants.length ? 'b' : 'a';
      identityMap.set(message.identity, key);
      profiles.push({key,sourceId:message.identity.startsWith('id:')?message.identity.slice(3):null,sourceName:message.name,lastAt:message.epoch,lastInExport:false});
      participants.push(makeParticipant(key, options.anonymize ? `Участник ${key.toUpperCase()}` : message.name || `Участник ${key.toUpperCase()}`));
    }
    message.key = identityMap.get(message.identity);
    const profile = profiles[message.key === 'a' ? 0 : 1];
    if (message.name) profile.sourceName = message.name;
    profile.lastAt = message.epoch;
  }
  if (normalized.length) profiles.find(p => p.key === normalized.at(-1).key).lastInExport = true;
  for (const profile of profiles) {
    const participant = participants.find(p => p.key === profile.key);
    if (!options.anonymize) participant.name = options.participantNames[profile.key]?.trim() || profile.sourceName || `Собеседник ${profile.key === 'a' ? 1 : 2}`;
  }
  // Identity metadata is local UI-only: never include source IDs in report aggregates.
  if (typeof onParticipants === 'function') onParticipants(profiles);

  const filtered = normalized.filter((message) => (!options.startDate || message.date >= options.startDate) && (!options.endDate || message.date <= options.endDate));
  quality.outsideRange = normalized.length - filtered.length;
  let first = '', last = '';
  for (const message of normalized) {
    if (!first || message.date < first) first = message.date;
    if (!last || message.date > last) last = message.date;
  }
  if (first && options.startDate && options.startDate > first) first = options.startDate;
  if (last && options.endDate && options.endDate < last) last = options.endDate;
  if (first > last) { first = ''; last = ''; }
  const dayCount = first ? (parseDay(last) - parseDay(first)) / DAY + 1 : 0;
  if (dayCount > MAX_DAYS) throw new Error('Диапазон выгрузки превышает 100 лет. Проверьте даты или выберите более короткий период.');
  const daily = [];
  const dayMap = new Map();
  for (let n = 0; n < dayCount; n++) {
    const date = new Date(parseDay(first) + n * DAY).toISOString().slice(0, 10);
    const row = { date, total: 0, a: 0, b: 0, avg7: null, startsA: 0, startsB: 0, wordsA: 0, wordsB: 0 };
    daily.push(row);
    dayMap.set(date, row);
  }
  const heatmap = Array.from({ length: 168 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24, a: 0, b: 0, total: 0 }));
  const participantMap = new Map(participants.map((participant) => [participant.key, participant]));
  const activeSets = { a: new Set(), b: new Set() };
  for (const message of filtered) {
    const participant = participantMap.get(message.key);
    const row = dayMap.get(message.date);
    row.total++; row[message.key]++;
    row[message.key === 'a' ? 'wordsA' : 'wordsB'] += message.counts.words;
    participant.messages++;
    for (const field of ['words', 'characters', 'questions', 'links', 'forwards', 'replies', 'reactionsReceived', 'edited', 'voiceSeconds', 'videoSeconds']) participant[field] += message.counts[field];
    if (message.counts.media) participant.media[message.counts.media]++;
    if (message.hour < 6) participant.nightMessages++;
    activeSets[message.key].add(message.date);
    const weekday = (new Date(parseDay(message.date)).getUTCDay() + 6) % 7;
    const cell = heatmap[weekday * 24 + message.hour];
    cell.total++; cell[message.key]++;
  }
  let rollingTotal = 0;
  for (let index = 0; index < daily.length; index++) {
    rollingTotal += daily[index].total;
    if (index >= 7) rollingTotal -= daily[index - 7].total;
    if (index >= 6) daily[index].avg7 = round(rollingTotal / 7);
  }
  const grouping = groupSessions(filtered, options.sessionGapHours, true);
  const { groups, responses, monthlyResponses, turns } = grouping;
  for (let index = 1; index < groups.length; index++) {
    const group = groups[index];
    participantMap.get(group.starter).starts++;
    dayMap.get(group.date)[group.starter === 'a' ? 'startsA' : 'startsB']++;
  }
  // Only completed, two-sided sessions have an observable final turn with no further reply.
  // The last exported session is right-censored; one-sided starts are not unanswered replies.
  for (let index = 0; index < groups.length - 1; index++) {
    if (groups[index].seen.size === 2) participantMap.get(groups[index].lastKey).unansweredSessions++;
  }
  for (const participant of participants) {
    participant.activeDays = activeSets[participant.key].size;
    participant.turns = turns[participant.key];
    participant.response = responseSummary(responses[participant.key]);
    participant.voiceSeconds = round(participant.voiceSeconds);
    participant.videoSeconds = round(participant.videoSeconds);
  }
  const sessions = groups.map((group, index) => ({ date: group.date, starter: group.starter, messages: group.messages, durationMinutes: round((group.end - group.start) / 60000), twoSided: group.seen.size === 2, censored: index === 0 || index === groups.length - 1 }));
  const monthlyMap = new Map();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, { month, total: 0, a: 0, b: 0, startsA: 0, startsB: 0, responseA: null, responseB: null });
    const row = monthlyMap.get(month);
    for (const field of ['total', 'a', 'b', 'startsA', 'startsB']) row[field] += day[field];
  }
  for (const [month, values] of monthlyResponses) {
    const row = monthlyMap.get(month);
    row.responseA = quantile(values.a, 0.5);
    row.responseB = quantile(values.b, 0.5);
  }
  let longestStreakDays = 0, streak = 0, longestSilenceHours = 0;
  for (const day of daily) {
    streak = day.total ? streak + 1 : 0;
    longestStreakDays = Math.max(longestStreakDays, streak);
  }
  for (let index = 1; index < filtered.length; index++) longestSilenceHours = Math.max(longestSilenceHours, (filtered[index].epoch - filtered[index - 1].epoch) / 3600000);
  const activeDays = daily.filter((day) => day.total > 0).length;
  const twoSidedSessions = sessions.filter((session) => session.twoSided).length;
  const messages = filtered.length;
  const a = participantMap.get('a')?.messages || 0, b = participantMap.get('b')?.messages || 0;
  const summary = {
    messages, days: daily.length, activeDays, activeDayPct: percent(activeDays, daily.length),
    messagesPerActiveDay: activeDays ? round(messages / activeDays) : 0,
    sessions: sessions.length, eligibleStarts: Math.max(0, sessions.length - 1),
    twoSidedSessions, twoSidedSessionPct: percent(twoSidedSessions, sessions.length),
    medianSessionMinutes: quantile(groups.map((group) => (group.end - group.start) / 60000), 0.5),
    longestStreakDays, longestSilenceHours: round(longestSilenceHours),
    mutualityScore: messages ? round(100 * (1 - Math.abs(a - b) / messages)) : 0,
    exchangeScore: percent(twoSidedSessions, sessions.length), continuityScore: percent(activeDays, daily.length),
  };
  const sensitivity = [...new Set([2, 6, 12, 24, options.sessionGapHours])].sort((a, b) => a - b).map((hours) => {
    const alternative = hours === options.sessionGapHours ? groups : groupSessions(filtered, hours).groups;
    const starts = alternative.slice(1);
    return { hours, eligibleStarts: starts.length, a: starts.filter((group) => group.starter === 'a').length, b: starts.filter((group) => group.starter === 'b').length, twoSidedPct: percent(alternative.filter((group) => group.seen.size === 2).length, alternative.length) };
  });
  const trend = trendFor(daily);
  if (fallbackDates) quality.warnings.push(`Сообщения без Unix-времени: ${fallbackDates}. Для дат без смещения предполагается ${options.timezone === 'export' ? 'UTC; реальная длительность пауз при смене часового пояса неизвестна' : `зона ${options.timezone}; в повторяющемся осеннем часу выбрано первое вхождение`}.`);
  if (missingExportDates) quality.warnings.push(`У ${missingExportDates} сообщений нет локальной даты экспорта; для календаря использована UTC.`);
  if (fallbackNames) quality.warnings.push(`У ${fallbackNames} сообщений нет ID автора; автор определён по имени, которое могло меняться.`);
  if (quality.invalidMessages) quality.warnings.push(`Пропущены некорректные записи: ${quality.invalidMessages}.`);
  if (quality.duplicates) quality.warnings.push(`Повторные ID сообщений исключены: ${quality.duplicates}; сохранена первая корректная запись.`);
  if (participants.length < 2) quality.warnings.push('В доступных сообщениях меньше двух авторов; часть сравнений не имеет наблюдений.');
  if (quality.outsideRange) quality.warnings.push(`Вне выбранного периода: ${quality.outsideRange} сообщений.`);
  if (!messages) quality.warnings.push('В выбранном периоде нет сообщений.');
  quality.warnings.push('Крайние дни и сеансы могут быть неполными. Удалённые и невыгруженные сообщения восстановить нельзя.');
  const insights = [];
  if (messages) {
    const peak = daily.reduce((best, day) => day.total > best.total ? day : best, daily[0]);
    const tiedDays = daily.filter((day) => day.total === peak.total).length;
    insights.push({
      tone: 'neutral', title: 'Пик активности',
      body: `Максимум за день: ${peak.total}. Дата: ${peak.date}; это ${percent(peak.total, messages)}% сообщений выбранного периода.${tiedDays > 1 ? ` Дней с таким максимумом: ${tiedDays}; показан первый.` : ''}`,
    });
  } else {
    insights.push({ tone: 'neutral', title: 'В периоде нет сообщений', body: `В пределах доступного экспорта выбрано календарных дней: ${summary.days}. Для этого периода нет наблюдаемого пика активности.` });
  }
  if (sessions.length) {
    const starterCounts = participants.map((participant) => `${participantMap.get(participant.key).name}: ${participant.starts}`).join('; ');
    insights.push({
      tone: 'neutral', title: 'Кто начинал после паузы',
      body: `${starterCounts}. Всего учитываемых начал: ${summary.eligibleStarts}, после паузы от ${options.sessionGapHours} ч. Первый сеанс периода исключён.`,
    });
  }
  if (trend.available) {
    const changed = ['up', 'down'].includes(trend.direction);
    insights.push({
      tone: changed ? 'attention' : 'neutral',
      title: trend.direction === 'up' ? 'Активность выросла' : trend.direction === 'down' ? 'Активность снизилась' : 'Средняя активность за последние недели',
      body: `Сообщений в день за последние 7 полных дней: ${trend.currentMean}; за предшествующие 28: ${trend.previousMean}.${trend.changePct === null ? ' В базовом периоде сообщений не было.' : ` Изменение: ${trend.changePct > 0 ? '+' : ''}${trend.changePct}%.`}${changed ? ' Причина изменения по этим данным неизвестна.' : ''}`,
    });
  } else {
    const completeDays = Math.max(0, daily.length - trend.excludedBoundaryDays);
    insights.push({ tone: 'neutral', title: 'Для тренда пока мало дней', body: `Полных календарных дней в периоде: ${completeDays}; для сравнения нужны 35. Не хватает ${35 - completeDays}. Первый и последний видимый день исключены.` });
  }
  return {
    schemaVersion: 1,
    meta: { title: options.anonymize ? 'Личная переписка' : participants.map(p => p.name).join(' и ') || 'Личная переписка', generatedAt: new Date().toISOString(), startDate: first, endDate: last, timezone: options.timezone, sessionGapHours: options.sessionGapHours, anonymize: options.anonymize, includeLexicon: options.includeLexicon, partialBoundaryDays: true },
    quality, participants, summary, daily, monthly: [...monthlyMap.values()], heatmap, sessions, sensitivity, trend, insights,
    ...(options.includeLexicon ? { lexicon: lexiconResult(lexicalByIdentity, identityMap) } : {}),
  };
}
