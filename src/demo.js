export function createDemo() {
  let seed = 42017;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const messages = []; let id = 1;
  const start = Date.UTC(2026, 1, 1);
  for (let day = 0; day < 210; day++) {
    if (random() < (day > 155 && day < 179 ? .52 : .07)) continue;
    const sessions = 1 + Math.floor(random() * 3);
    for (let s = 0; s < sessions; s++) {
      let t = start + day * 864e5 + (8 + s * 6 + random()) * 36e5;
      let who = random() < (day < 100 ? .61 : .43) ? 0 : 1;
      const count = 15 + Math.floor(random() * (day > 155 && day < 179 ? 16 : 70));
      for (let n = 0; n < count; n++) {
        if (random() < .56) who = 1 - who;
        t += Math.floor(random() * 190 + 8) * 1000;
        const kind = random();
        const m = { id:id++, type:'message', date:new Date(t).toISOString().slice(0,19), date_unixtime:String(Math.floor(t/1000)), from:who ? 'Саша' : 'Женя', from_id:`user${who + 1}`, text:random()<.2 ? 'Как прошёл день? Давай обсудим планы.' : 'Это синтетическая реплика для демонстрации графиков.' };
        if (kind < .025) { m.media_type='voice_message'; m.duration_seconds=12+Math.floor(random()*90); m.text=''; }
        else if (kind < .055) { m.media_type='video_message'; m.duration_seconds=30; m.text=''; }
        else if (kind < .09) m.photo='synthetic-photo';
        else if (kind < .12) { m.media_type='sticker'; m.text=''; }
        if (random()<.1) m.reply_to_message_id=Math.max(1,m.id-1);
        if (random()<.08) m.reactions=[{type:'emoji',count:1,emoji:'❤'}];
        if (random()<.04) m.forwarded_from='Демо-канал';
        if (random()<.06) m.edited=m.date;
        messages.push(m);
      }
    }
  }
  return {name:'Демонстрация',type:'personal_chat',messages};
}
