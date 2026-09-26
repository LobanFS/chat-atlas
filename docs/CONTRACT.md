# Engine / report contract
ESM src/engine.js exports analyzeExport(input, options={}), DEFAULT_OPTIONS, flattenText.
Input raw parsed Telegram single personal_chat object. No group/full-account archive support v1; useful Russian errors.
Options: sessionGapHours (6 default; numeric >0 <=168), timezone ('export' default; or IANA such as Europe/Moscow, UTC), startDate/endDate (YYYY-MM-DD or ''), anonymize (true default), includeLexicon (false default; strict boolean). Invalid options must throw.
Return ONLY aggregates, no raw messages/ids/text; explicit includeLexicon opt-in additionally exports frequency-ranked word/emoji terms. Shape:
{
 schemaVersion:1,
 meta:{title, generatedAt, startDate, endDate, timezone, sessionGapHours, anonymize, includeLexicon, partialBoundaryDays:true},
 quality:{totalRecords, validMessages, serviceMessages, invalidMessages, duplicates, outsideRange, warnings:string[]},
 participants:[{key:'a'|'b',name,messages,words,characters,questions,links,forwards,replies,reactionsReceived,edited,media:{photo,video_message,voice_message,video_file,sticker,animation,audio_file,file,other},voiceSeconds,videoSeconds,activeDays,nightMessages,starts,turns,response:{count,medianSeconds,p90Seconds,under5minPct},unansweredSessions}],
 summary:{messages,days,activeDays,activeDayPct,messagesPerActiveDay,sessions,eligibleStarts,twoSidedSessions,twoSidedSessionPct,medianSessionMinutes,longestStreakDays,longestSilenceHours,mutualityScore,exchangeScore,continuityScore},
 daily:[{date,total,a,b,avg7:null|number,startsA,startsB}],
 monthly:[{month,total,a,b,startsA,startsB,responseA:null|number,responseB:null|number}],
 heatmap:[{day:0..6 Monday first,hour:0..23,a,b,total}],
 sessions:[{date,starter:'a'|'b',messages,durationMinutes,twoSided,censored:boolean}], // aggregated session info only
 sensitivity:[{hours,eligibleStarts,a,b,twoSidedPct}], // 2,6,12,24h thresholds plus selected; sorted
 trend:{available,previousMean,currentMean,changePct:null|number,zScore:null|number,direction:'up'|'down'|'stable'|'insufficient',baselineDays,comparisonDays,excludedBoundaryDays},
 insights:[{tone:'neutral'|'positive'|'attention',title,body}],
 lexicon?:{words:[{term,a,b,total}],emojis:[{term,a,b,total}],excludedStopWords:true,minimumWordLength:3,limit:24} // only with includeLexicon:true
}
Metrics: first exported/filtered session excluded from eligible starts; gap >= threshold begins session; response samples between adjacent alternating author turns within same session, measured last previous turn message to first reply; no response across sessions. All elapsed times use epoch; calendar uses chosen zone or exported date. day grid continuous incl zero days. trend compares last 7 complete calendar days to preceding 28 complete days (exclude first and last visible day); report counts actual samples, no significance claims. Mutuality 100*(1-abs(a-b)/(a+b)); exchange is two-sided session share; continuity is active day share. Indices are descriptive, not psychological. Count words on flattened text. No lexical content is exported unless includeLexicon is explicitly true. Participant order stable first observed by from_id, fallback from name. >2 speakers reject, one speaker graceful.

ESM src/report.js exports renderReport(data,{mode:'full'|'overview'|'rhythm'|'dialogue'}={}) -> HTML fragment, no document wrapper/scripts/styles. No imports needed. Escape all text. Full report uses semantic sections IDs overview/rhythm/dialogue/habits/method. CSS class hooks can be freely chosen but notify root. Charts inline SVG with readable labels/title, accessible summary/tables; data series A teal #147d78, B indigo #6760d5. Responsive on white/slate background. Report top header handled by app. Rich report should be useful for 46k msgs / 209 days and tiny datasets alike. Never infer attraction, mental state, quality of relationship.
Root owns app.js/styles.css/index.template.html/build/server/demo and integration; core agent engine/tests; renderer agent report.js only.

Optional lexicon: selected-date-range message text only (including forwarded message text); count every occurrence, not messages. Words use Unicode letters/numbers, lowercase NFC exact forms without stemming, minimum 3 Unicode code points and at least one letter; common static Russian/English stop words excluded. URLs, bare domain links and emails are stripped before word/emoji tokenization, hidden link targets never included. Emoji use Intl.Segmenter grapheme clusters with Extended_Pictographic / Emoji_Presentation / keycap detection, preserving ZWJ, skin tones and flags as complete terms. Sticker emoji and reactions are excluded. Each list contains at most 24 terms, ordered by descending total and then locale-independent lexical order. Anonymization changes names only; explicit lexical output can contain private words and is opt-in separately. Default output omits lexicon entirely; meta.includeLexicon always states the setting.

## Variant 02 additions
`analyzeExport(input, options, onParticipants?)` accepts optional `participantNames:{a?:string,b?:string}` (up to 80 characters each). A/B keys still derive from stable from_id identity in first-observed order. Last known source name is used, overridden by a non-empty alias; anonymize=true ignores both. Optional callback gets local-only `{key,sourceId,sourceName,lastAt,lastInExport}`; never embed this callback metadata in portable reports. Daily rows add wordsA/wordsB. Engine keeps anonymize=true default; browser UI explicitly selects false.
`report.js` imports `renderExplorer` from explore.js and accepts `explorerPrefs`. The portable document accepts trusted local `runtime` code. Its JSON payload whitelists daily numeric aggregates and participant display names/keys, not the entire engine result. Controls recompute views from aggregates, with no network or source messages.
