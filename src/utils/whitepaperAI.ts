import type { AIGeneratedData, PaperLayoutPreset, TimelineEvent, WhitepaperFactCard } from '@/types';
import type { Locale } from '@/utils/locale';

type RawStructuredWhitepaper = {
  headline?: unknown;
  subtitle?: unknown;
  lead?: unknown;
  handwrittenBody?: unknown;
  factCards?: unknown;
  timeline?: unknown;
  observations?: unknown;
  closing?: unknown;
  imageInsight?: unknown;
  layoutRecommendation?: unknown;
};

export type WhitepaperChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
};

export function safeText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

const PAPER_LAYOUT_ALIASES: Record<string, PaperLayoutPreset> = {
  minimal: 'minimal',
  simple: 'minimal',
  clean: 'minimal',
  concise: 'minimal',
  极简: 'minimal',
  简洁: 'minimal',
  简单: 'minimal',
  editorial: 'editorial',
  narrative: 'editorial',
  story: 'editorial',
  article: 'editorial',
  叙事: 'editorial',
  文章: 'editorial',
  evidence: 'evidence',
  gallery: 'evidence',
  proof: 'evidence',
  board: 'evidence',
  证据: 'evidence',
  图像: 'evidence',
  timeline: 'timeline',
  chronological: 'timeline',
  sequence: 'timeline',
  时间线: 'timeline',
  时序: 'timeline',
  scrapbook: 'scrapbook',
  collage: 'scrapbook',
  mixed: 'scrapbook',
  拼贴: 'scrapbook',
  碎贴: 'scrapbook',
};

function isPlaceholderText(value: string) {
  return /(待补充|未提供|未明|待确认|进一步确认|当前整理|素材已收到|AI 已收到|结构化结果不完整|先按原文|一版白纸|暂无更多正文|无图片素材|to be added|not provided|unknown|tbd|pending confirmation|ai received|incomplete structured output|no image provided)/i.test(
    value,
  );
}

function sanitizeText(value: unknown, fallback = '') {
  const text = safeText(value, fallback);
  return text && !isPlaceholderText(text) ? text : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item && !isPlaceholderText(item));
}

function normalizeFactCards(value: unknown): WhitepaperFactCard[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const card = item as Record<string, unknown>;
      const label = safeText(card.label);
      const factValue = sanitizeText(card.value);

      if (!label || !factValue) return null;

      return {
        id: crypto.randomUUID(),
        label,
        value: factValue,
      };
    })
    .filter((item): item is WhitepaperFactCard => item !== null)
    .slice(0, 4);
}

function normalizeTimeline(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const timelineItem = item as Record<string, unknown>;
      const dateString = sanitizeText(timelineItem.dateString);
      const description = sanitizeText(timelineItem.description);

      if (!dateString || !description) return null;

      return {
        id: crypto.randomUUID(),
        dateString,
        description,
      };
    })
    .filter((item): item is TimelineEvent => item !== null)
    .slice(0, 5);
}

function inferLayoutRecommendation(title: string, prompt: string, imageCount: number): PaperLayoutPreset {
  const source = `${title} ${prompt}`.toLowerCase();
  const timelineSignals = /(先|随后|然后|后来|接着|最终|before|after|then|later|eventually|timeline|chronology|顺序|过程|阶段)/i.test(
    `${title} ${prompt}`,
  );
  const collageSignals = /(票据|截图|海报|拼贴|照片墙|note|memo|scrap|collage|poster|receipt)/i.test(
    `${title} ${prompt}`,
  );
  const evidenceSignals = /(证据|对照|记录板|档案|截图对比|证物|evidence|proof|comparison|archive|case board)/i.test(
    `${title} ${prompt}`,
  );

  if (imageCount >= 3 || (imageCount >= 2 && collageSignals)) return 'scrapbook';
  if (timelineSignals) return 'timeline';
  if (evidenceSignals && imageCount > 0) return 'evidence';
  if (prompt.length > 120 || prompt.split(/\n+/).filter(Boolean).length > 2) return 'editorial';
  return 'minimal';
}

function normalizeLayoutRecommendation(value: unknown, fallback: PaperLayoutPreset): PaperLayoutPreset {
  const text = safeText(value).toLowerCase();

  if (!text) return fallback;
  if (text in PAPER_LAYOUT_ALIASES) return PAPER_LAYOUT_ALIASES[text];

  const aliasEntry = Object.entries(PAPER_LAYOUT_ALIASES).find(([alias]) => text.includes(alias));
  return aliasEntry?.[1] || fallback;
}

export function parseStructuredPayload(rawText: string) {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const jsonStart = candidate.indexOf('{');
  const jsonEnd = candidate.lastIndexOf('}');
  const jsonString =
    jsonStart !== -1 && jsonEnd !== -1 ? candidate.slice(jsonStart, jsonEnd + 1) : candidate;

  return JSON.parse(jsonString) as RawStructuredWhitepaper;
}

function inferTime(prompt: string, locale: Locale) {
  if (locale === 'en') {
    const source = prompt.toLowerCase();
    if (/(late night|midnight|night|nightfall)/.test(source)) return 'that night';
    if (/(morning|sunrise|daybreak|dawn)/.test(source)) return 'that morning';
    if (/(evening|dusk|sunset|twilight)/.test(source)) return 'that evening';
    if (/(noon|afternoon)/.test(source)) return 'that afternoon';
    if (/(rain|rainy|in the rain)/.test(source)) return 'while it was raining';
    return 'that day';
  }

  if (/雨夜|深夜|夜里|夜晚|夜色/.test(prompt)) return '夜里';
  if (/清晨|早上|天亮/.test(prompt)) return '清晨';
  if (/傍晚|黄昏/.test(prompt)) return '傍晚';
  if (/中午|午后|下午/.test(prompt)) return '午后';
  if (/雨天|下雨|雨里/.test(prompt)) return '下雨的时候';
  return '那天';
}

function inferPlace(prompt: string, locale: Locale) {
  if (locale === 'en') {
    const source = prompt.toLowerCase();
    if (/(subway|metro|platform|station)/.test(source)) return 'by the platform';
    if (/(hallway|corridor|stairwell)/.test(source)) return 'in the hallway';
    if (/(street corner|intersection|alley|corner)/.test(source)) return 'at the corner';
    if (/(doorway|entrance|downstairs|front door)/.test(source)) return 'by the doorway';
    if (/(cafe|coffee shop|store|shop)/.test(source)) return 'inside the shop';
    if (/(rain|rainy|in the rain)/.test(source)) return 'under a place that could block the rain';
    return 'in that familiar place';
  }

  if (/地铁|站台|车站/.test(prompt)) return '站台边';
  if (/楼道|走廊/.test(prompt)) return '走廊里';
  if (/街口|路口|巷子/.test(prompt)) return '街口';
  if (/门口|楼下/.test(prompt)) return '门口';
  if (/咖啡店|店里/.test(prompt)) return '店里';
  if (/雨天|下雨|雨里/.test(prompt)) return '躲雨的地方';
  return '那片熟悉的地方';
}

function inferPeople(prompt: string, locale: Locale) {
  if (locale === 'en') {
    const source = prompt.toLowerCase();
    if (/\bshe\b/.test(source)) return 'me and her';
    if (/\bhe\b/.test(source)) return 'me and him';
    if (/\bwe\b/.test(source)) return 'us';
    if (/(passenger|guard|security)/.test(source)) return 'the people on site';
    return 'me and the person who appeared again';
  }

  if (/她/.test(prompt)) return '我、她';
  if (/他/.test(prompt)) return '我、他';
  if (/我们/.test(prompt)) return '我们';
  if (/乘客|保安/.test(prompt)) return '现场的人';
  return '我和那个重新出现的人';
}

export function buildExpandedFallbackData(
  title: string,
  prompt: string,
  model: string,
  locale: Locale,
  imageCount = 0,
): AIGeneratedData {
  const sourceLines = prompt
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const seed = sourceLines[0] || title || (locale === 'en' ? 'Something small that happened that day' : '那天发生的一件小事');
  const seedSource = `${seed} ${prompt}`;
  const normalizedSeed = seedSource.toLowerCase();
  const time = inferTime(prompt || title, locale);
  const place = inferPlace(prompt || title, locale);
  const people = inferPeople(prompt || title, locale);
  const layoutRecommendation = inferLayoutRecommendation(title, prompt, imageCount);

  const headline = locale === 'en'
    ? (
        title ||
        (seed.length <= 18
          ? seed
          : /rain.*(her|again)/.test(normalizedSeed)
            ? 'Rainy Night Reunion'
            : /(reunion|again|saw her|saw him|met again|goodbye)/.test(normalizedSeed)
              ? 'The Night We Met Again'
              : `${seed.slice(0, 18)}...`)
      )
    : (
        title ||
        (seed.length <= 10
          ? seed
          : /雨.*她/.test(seed)
            ? '雨夜重逢'
            : /重逢|再见/.test(seed)
              ? '重逢那晚'
              : `${seed.slice(0, 8)}记事`)
      );

  const subtitle = locale === 'en'
    ? (/(rain|rainy)/.test(normalizedSeed)
        ? 'I am writing this down before the rain-sound fades from me'
        : 'I want to leave this here before the feeling loosens')
    : (/雨/.test(seed + prompt)
        ? '我先把这一晚记在这里，免得雨声一散就忘了'
        : '先写下来，免得这一小段很快散掉');

  const lead = locale === 'en'
    ? `${time}, I was at ${place}${/(see|saw|met again|reunion|again)/.test(normalizedSeed) ? ' when I saw someone I never expected to see again.' : ' when I ran into something that had never really ended.'}`
    : `${time}，我在${place}${/见到|看到|重逢|再见/.test(seed + prompt) ? '重新看见了那个本以为不会再出现的人。' : '重新碰见了那件一直没有说完的事。'}`;

  const body = locale === 'en'
    ? [
        `${seed.replace(/[.。！!？?]+$/, '')}.`,
        `No one tried to define the moment on the spot. ${people} just paused together for a second, as if an old memory had lightly touched the scene.`,
        /(rain|rainy)/.test(normalizedSeed)
          ? 'The rain did not stop right away. Damp hems and wet shoes held in place the things that still went unsaid.'
          : 'The noise around us was not loud, but that small hesitation bent the line of time just enough to be remembered.',
        'People still drifted apart afterward, and nothing was fully explained, but it was enough to become a complete night in memory.',
      ]
    : [
        `${seed.replace(/[。！!？?]+$/, '')}。`,
        `当时没有人替这件事下定义，只是${people}都在同一个瞬间停了一下，像是被什么旧的记忆轻轻碰到。`,
        /雨/.test(seed + prompt)
          ? '雨没有立刻停，衣角和鞋边都沾了潮气，很多没说出口的话也跟着留在原地。'
          : '周围的声音并不大，但那一点迟疑把原本平直的时间折出了一道弯。',
        '后来人还是散开了，事情也没有真正被说明白，可它已经足够构成一个完整的夜晚。',
      ];

  const observations = locale === 'en'
    ? [
        'What I remember most is still that brief pause.',
        `What stayed with me was not the ending, but that moment back at ${place}.`,
        /\b(she|he)\b/.test(normalizedSeed)
          ? 'I still did not say who we really were to each other.'
          : 'There were not many people there, but every small movement kept changing the mood.',
        'This is not a full explanation. It is just the part I do not want to lose.',
      ]
    : [
        '我最后记住的，其实就是那一下停顿。',
        `真正留下来的不是结论，而是${place}里的那一下重新撞见。`,
        /她|他/.test(seed + prompt)
          ? '我还是没有把彼此的关系说破，可那种熟悉感已经够明显了。'
          : '现场的人并不多，可每一个动作都在改掉当时的气氛。',
        '这不是完整说明，只是我不想让它散掉的一小段。',
      ];

  return {
    headline,
    subtitle,
    lead,
    handwrittenBody: body,
    factCards: [
      { id: crypto.randomUUID(), label: locale === 'en' ? 'Time' : '时间', value: time },
      { id: crypto.randomUUID(), label: locale === 'en' ? 'Place' : '地点', value: place },
      { id: crypto.randomUUID(), label: locale === 'en' ? 'People' : '人物', value: people },
      {
        id: crypto.randomUUID(),
        label: locale === 'en' ? 'Outcome' : '结果',
        value:
          locale === 'en'
            ? (/(reunion|again|goodbye|met again|saw)/.test(normalizedSeed)
                ? 'Old details surfaced again, but nothing was fully spoken aloud'
                : 'The moment ended, but its aftertaste stayed behind')
            : (/重逢|再见|见到/.test(seed + prompt)
                ? '旧事被重新翻起，但没有彻底说破'
                : '事情结束了，余波还留在心里'),
      },
    ],
    timeline: [
      {
        id: crypto.randomUUID(),
        dateString: locale === 'en' ? `Before ${time}` : `${time}之前`,
        description: locale === 'en' ? 'It had begun as an ordinary day, before the moment revealed its weight.' : '原本只是普通的一天，事件还没有显出它的重量。',
      },
      {
        id: crypto.randomUUID(),
        dateString: time,
        description: locale === 'en' ? `${people} crossed paths briefly but clearly at ${place}.` : `${people}在${place}发生了短暂但清晰的交汇。`,
      },
      {
        id: crypto.randomUUID(),
        dateString: locale === 'en' ? `After ${time}` : `${time}之后`,
        description: locale === 'en' ? 'People left the scene, but that instant stayed behind in memory.' : '人离开了现场，但那一刻被留在了记忆里。',
      },
    ],
    observations,
    closing: locale === 'en' ? 'I will leave the sheet here first. The rest can stay unsaid for now.' : '我先把这张纸写到这里，剩下那些没说完的，先留着。',
    imageInsight:
      imageCount > 0
        ? locale === 'en'
          ? imageCount === 1
            ? 'I pasted this one beside the text because the light and place say more than I can at once.'
            : `I left ${imageCount} photos on the paper because they keep the scene from slipping too far away.`
          : imageCount === 1
            ? '我把这张图贴在旁边，是怕当时的光线和位置一下就从记忆里滑掉。'
            : `我把这 ${imageCount} 张图一起贴在纸上，免得那点现场感很快散掉。`
        : undefined,
    layoutRecommendation,
    model,
  };
}

export function normalizeStructuredData(
  raw: RawStructuredWhitepaper,
  fallbackTitle: string,
  fallbackPrompt: string,
  model: string,
  locale: Locale,
  imageCount = 0,
): AIGeneratedData {
  const expandedFallback = buildExpandedFallbackData(fallbackTitle, fallbackPrompt, model, locale, imageCount);
  const factCards = normalizeFactCards(raw.factCards);
  const timeline = normalizeTimeline(raw.timeline);
  const handwrittenBody = normalizeStringArray(raw.handwrittenBody, []);
  const observations = normalizeStringArray(raw.observations, []);

  return {
    headline: sanitizeText(raw.headline, expandedFallback.headline),
    subtitle: sanitizeText(raw.subtitle, expandedFallback.subtitle),
    lead: sanitizeText(raw.lead, expandedFallback.lead),
    handwrittenBody:
      handwrittenBody.length > 0
        ? handwrittenBody.slice(0, 4)
        : expandedFallback.handwrittenBody,
    factCards: factCards.length > 0 ? factCards : expandedFallback.factCards,
    timeline: timeline.length > 0 ? timeline : expandedFallback.timeline,
    observations: observations.length > 0 ? observations.slice(0, 4) : expandedFallback.observations,
    closing: sanitizeText(raw.closing, expandedFallback.closing),
    imageInsight: sanitizeText(raw.imageInsight, '') || expandedFallback.imageInsight,
    layoutRecommendation: normalizeLayoutRecommendation(raw.layoutRecommendation, expandedFallback.layoutRecommendation),
    model,
  };
}

export function buildGenerateMessages(
  title: string,
  prompt: string,
  imageDataUrls: string[],
  locale: Locale,
): WhitepaperChatMessage[] {
  const systemPrompt = locale === 'en'
    ? [
        'You are a writer who turns scattered material into content for a blank-paper presentation.',
        'Return a JSON object only. Do not output markdown. Do not explain.',
        'The content language must be English.',
        'The goal is to produce content that fits on a single blank-paper composition: short sentences, clear structure, restraint, and a sense of scene, without reading like a form template.',
        'The voice must feel first-person, as if the writer is leaving notes for themselves on a sheet of paper after experiencing the scene.',
        'The user may give you only one sentence, one image, one symbol, or a broken fragment plus a set of images that will be pinned onto the paper.',
        'Expand the clues into one complete, believable, writable event.',
        'Reasonably fill in missing texture, but do not exaggerate, do not write crime-report drama, and do not manufacture a huge spectacle.',
        'Do not mechanically repeat the original sentence. Turn it into an event with time, place, people, change, and aftereffects.',
        'Do not sound like a detached analyst, journalist, or police note.',
        'If details are thin, do not write meta filler like "to be added", "unknown", or "AI received the material". Use natural, slightly blurry phrasing instead.',
        'If the user uploaded images, you may use directly visible visual clues to infer atmosphere, objects, setting, and movement, but do not invent core facts that cannot be confirmed from the images.',
        'The JSON must include: headline, subtitle, lead, handwrittenBody, factCards, timeline, observations, closing, imageInsight, layoutRecommendation.',
        'handwrittenBody must be an array of 2 to 4 paragraphs, each with 1 to 2 sentences.',
        'factCards must be an array of 4 objects with label and value, suitable for Time / Place / People / Outcome.',
        'timeline must be an array of 3 to 5 items, each with dateString and description.',
        'observations must be an array of 3 to 4 short lines that can sit directly on the paper.',
        'layoutRecommendation must be exactly one of: minimal, editorial, evidence, timeline, scrapbook.',
        'Prefer minimal or editorial by default. Use evidence only when the user clearly wants a proof-board feeling, timeline only when chronology matters most, and scrapbook only when there are many image fragments.',
        'minimal means sparse and text-first; editorial means title-and-body led; evidence means images/cards should feel prominent; timeline means chronology should dominate; scrapbook means images, notes, and fragments should feel layered.',
        'headline and subtitle should read like real paper titles. Avoid words like record, input material, or AI.',
        'Unless the user sentence is already exceptionally strong, do not reuse it unchanged as the headline, lead, or first body paragraph.',
        'imageInsight should be one short first-person note beside the pasted image, not a detached visual analysis paragraph.',
      ].join('\n')
    : [
        '你是一个把零散素材整理成白纸展示内容的写作者。',
        '请输出 JSON 对象，不要输出 markdown，不要解释。',
        '内容语言必须是简体中文。',
        '目标是生成适合显示在一张白纸上的内容，短句、清楚、克制、带现场感，但不要像模板表单。',
        '语气必须像当事人自己在写白纸，默认使用第一人称，要像写给自己看的记事。',
        '用户给你的素材可能只有一句话、一个意象、一段残缺描述，或者附带一组会被贴在白纸上的图片。',
        '你要把它扩成一件完整、可信、可落笔的事件。',
        '允许根据线索做合理补全，但不要夸张，不要写成刑侦新闻，也不要制造大场面。',
        '不要机械复述用户原句；要把原句展开成有时间、地点、人物、变化和余波的一件事。',
        '不要写成旁观分析、报道摘要、证据解读或说明文。',
        '如果细节不足，不要写“待补充”“未明”“AI 已收到素材”这种元话术；请用模糊但自然的表达补足。',
        '如果用户上传了图片，可以根据图片直接可见的信息辅助判断现场氛围、物件、场景和动作，但不要臆造无法从图像确认的核心事实。',
        'JSON 结构必须包含：headline、subtitle、lead、handwrittenBody、factCards、timeline、observations、closing、imageInsight、layoutRecommendation。',
        'handwrittenBody 是 2 到 4 段数组，每段 1 到 2 句。',
        'factCards 是 4 个对象数组，每项包含 label 和 value，适合使用“时间/地点/人物/结果”。',
        'timeline 是 3 到 5 项数组，每项包含 dateString 和 description。',
        'observations 是 3 到 4 条数组，适合直接落在白纸上。',
        'layoutRecommendation 必须且只能是以下五个值之一：minimal、editorial、evidence、timeline、scrapbook。',
        '默认优先使用 minimal 或 editorial。只有用户明确想做证据板时才用 evidence，只有时间顺序特别重要时才用 timeline，只有图片碎片很多时才用 scrapbook。',
        'minimal 表示极简留白、以文字为主；editorial 表示标题和正文主导；evidence 表示图片和侧记更突出；timeline 表示时间脉络主导；scrapbook 表示图片、贴纸、碎片感更强。',
        'headline 和 subtitle 需要像真正的白纸标题，不要出现“记录”“输入素材”“AI”这种词。',
        '除非用户原句本身已经非常成立，否则不要直接把原句原封不动拿来做 headline、lead 和正文第一段。',
        'imageInsight 只写一句贴图旁注，要像我写在图片边上的补充，不要写成长段图像分析。',
      ].join('\n');

  const userPrompt = locale === 'en'
    ? [
        `Title: ${title || 'Not provided'}`,
        '',
        'Text material:',
        prompt || 'No text material provided',
        '',
        imageDataUrls.length > 0
          ? `Extra note: the user uploaded ${imageDataUrls.length} image(s). They will be pinned directly onto the blank paper. Use directly visible visual clues to understand the event.`
          : '',
      ].filter(Boolean).join('\n')
    : [
        `标题：${title || '未提供'}`,
        '',
        '文字素材：',
        prompt || '未提供文字素材',
        '',
        imageDataUrls.length > 0
          ? `附加说明：用户上传了 ${imageDataUrls.length} 张图片，这些图片会直接贴在白纸上。请结合可见图像线索理解事件。`
          : '',
      ].filter(Boolean).join('\n');

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        ...imageDataUrls.map((url) => ({
          type: 'image_url',
          image_url: {
            url,
            detail: 'auto',
          },
        })),
      ],
    },
  ];
}

export function buildRepairMessages(rawText: string, locale: Locale): WhitepaperChatMessage[] {
  return [
    {
      role: 'system',
      content: locale === 'en'
        ? [
            'You are a JSON repairer.',
            'Turn the user content into one strictly valid JSON object.',
            'Do not output markdown, explanations, or code fences.',
            'The JSON must include: headline, subtitle, lead, handwrittenBody, factCards, timeline, observations, closing, imageInsight, layoutRecommendation.',
            'handwrittenBody must be an array of 2 to 4 strings.',
            'factCards must be an array of 4 items, each with label and value.',
            'timeline must be an array of 3 to 5 items, each with dateString and description.',
            'observations must be an array of 3 to 4 strings.',
            'layoutRecommendation must be exactly one of: minimal, editorial, evidence, timeline, scrapbook.',
          ].join('\n')
        : [
            '你是一个 JSON 整理器。',
            '把用户给你的内容整理成一个严格合法的 JSON 对象。',
            '不要输出 markdown，不要输出解释，不要输出代码块。',
            'JSON 必须包含：headline、subtitle、lead、handwrittenBody、factCards、timeline、observations、closing、imageInsight、layoutRecommendation。',
            'handwrittenBody 必须是 2 到 4 条字符串数组。',
            'factCards 必须是 4 项数组，每项包含 label 和 value。',
            'timeline 必须是 3 到 5 项数组，每项包含 dateString 和 description。',
            'observations 必须是 3 到 4 条字符串数组。',
            'layoutRecommendation 必须且只能是：minimal、editorial、evidence、timeline、scrapbook 之一。',
          ].join('\n'),
    },
    {
      role: 'user',
      content:
        locale === 'en'
          ? `Turn the following content into the required JSON:\n\n${rawText}`
          : `把下面内容整理成符合要求的 JSON：\n\n${rawText}`,
    },
  ];
}
