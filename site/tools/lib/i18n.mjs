// UI strings of the generated pages (docs chrome, hubs, reference, search).
// Content itself lives in site/tools/docs-src/**; this file only holds the frame.
// Node standard library only.

export const LANGS = ['en', 'uk'];

/** "" for English, "uk/" for Ukrainian — the language root below the site root. */
export const langRoot = (lang) => (lang === 'uk' ? 'uk/' : '');

/** Path of the same page in another language (site-root relative). */
export function altPath(path, toLang) {
  const bare = path.startsWith('uk/') ? path.slice(3) : path;
  return langRoot(toLang) + bare;
}
export const langOfPath = (path) => (path.startsWith('uk/') ? 'uk' : 'en');

const plural = {
  en: (n, one, many) => `${n} ${n === 1 ? one : many}`,
  // Ukrainian: 1 команда, 2–4 команди, 5+ команд (11–14 → many)
  uk: (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
    return `${n} ${w}`;
  },
};

export const T = {
  en: {
    code: 'en', name: 'English', short: 'EN', locale: 'en_US',
    skip: 'Skip to content',
    nav: {
      main: 'Main', home: 'Kadr home', docs: 'Docs', guide: 'For humans', ai: 'For AI', reference: 'Commands',
      changelog: 'Changelog', features: 'Features', api: 'API', captions: 'Captions', smart: 'Smart tools',
      download: 'Download', downloadLong: 'Download Kadr', menu: 'Menu', github: 'Kadr on GitHub',
      language: 'Language', theme: 'Switch between dark and light theme', search: 'Search the docs',
    },
    footer: {
      tagline: 'The video editor your AI can drive. Free for Windows 10 & 11 — macOS is coming.',
      product: 'Product', download: 'Download', features: 'Features', changelog: 'Changelog', requirements: 'Requirements',
      docs: 'Docs', guide: 'User guide', ai: 'AI documentation', reference: 'Command reference', mcp: 'Connect Claude (MCP)', llms: 'llms.txt for AI',
      kadr: 'Kadr', faq: 'FAQ', privacy: 'Privacy', licenses: 'Licences', bug: 'Report a bug', github: 'GitHub',
      copy: '© 2026 Kadr. Freeware for Windows · macOS coming soon.', notAffiliated: 'Not affiliated with ByteDance or CapCut.',
    },
    docs: {
      title: 'Documentation', crumbsDocs: 'Docs', onThisPage: 'On this page', backToTop: 'Back to top',
      prev: 'Previous', next: 'Next', menu: 'Docs menu', close: 'Close menu', searchDocs: 'Search docs',
      copy: 'Copy', copyCode: 'Copy code', linkTo: 'Link to this section', codeExamples: 'Code examples',
      minRead: (n) => `${n} min read`,
      untranslated: 'This page is only available in Ukrainian for now — the original is below.',
      untranslatedTitle: 'Not translated yet',
      sections: {
        guide: { short: 'For humans', title: 'User guide', kicker: 'For humans', desc: 'How to edit videos in Kadr: the interface, timeline, text and captions, effects, audio, export and every keyboard shortcut.' },
        ai: { short: 'For AI', title: 'AI documentation', kicker: 'For AI agents', desc: 'How Claude and other AI agents drive Kadr over MCP, REST and the CLI: concepts, verification, best practices, recipes and the full command reference.' },
        site: { short: 'Kadr', title: 'Kadr' },
      },
      allTopics: 'All topics',
      sectionHome: 'Start here',
      comingSoonTitle: 'Coming soon',
      comingSoon: {
        guide: 'The user guide is being written right now: installation, the interface tour, timeline editing, text, captions, effects, audio, export and every shortcut — in English and Ukrainian.',
        ai: 'The AI documentation is being written right now: MCP quick start for Claude, the REST API, kadrctl, concepts, recipes and best practices — in English and Ukrainian.',
      },
      meanwhile: 'Meanwhile',
      pagesCount: (n) => plural.en(n, 'page', 'pages'),
      morePages: (n) => `+${n} more`,
      open: { guide: 'Open the user guide', ai: 'Open the AI docs' },
    },
    hub: {
      title: 'Documentation',
      description: 'Kadr documentation in two parts: a user guide for people who edit, and AI docs for agents that edit for them — MCP, REST, CLI and every command.',
      eyebrow: 'Kadr docs',
      h1a: 'Learn Kadr.', h1b: 'Or teach your AI.',
      sub: 'Two sets of docs for two kinds of editors: people who click, and agents that call commands. Same editor, same undo history.',
      searchPlaceholder: 'Search guides, AI docs and commands…',
      humans: { kicker: 'For humans', title: 'User guide', text: 'Learn the editor: the interface, timeline, text and captions, effects and colour, audio, AI tools, export and every shortcut.', cta: 'Open the guide' },
      ai: { kicker: 'For AI agents', title: 'AI documentation', text: 'Connect Claude or any MCP client, call the REST API or kadrctl, follow the concepts and recipes — with all {n} commands documented.', cta: 'Open the AI docs' },
      quick: 'Quick links',
      q: {
        install: ['Install Kadr', 'Windows 10 & 11 installer, first launch, FFmpeg'],
        mcp: ['Connect Claude', 'MCP setup for Claude Desktop, Claude Code and others'],
        reference: ['Command reference', '{n} commands with parameters and examples'],
        llms: ['llms.txt', 'Machine-readable index of the docs for LLMs'],
        openapi: ['openapi.json', 'OpenAPI 3.1 spec of every command'],
        changelog: ['Changelog', 'What is new in each release'],
      },
      soon: 'Coming soon',
    },
    ref: {
      title: 'Command reference', crumb: 'Commands', groupTitle: 'Command reference', all: 'All commands',
      lead: (n) => `Every action in Kadr is one of these ${n} commands. The editor's buttons, the REST API, the MCP tools and <code>kadrctl</code> all call the same registry, so this page is the complete map of what the editor can do.`,
      description: (n) => `All ${n} Kadr commands — the same API behind every button, for REST, MCP and kadrctl.`,
      calling: 'Calling a command', conventions: 'Conventions', categories: 'Categories', allCommands: 'All commands',
      callingItems: (root, links) => [
        `<strong>REST:</strong> <code>POST http://127.0.0.1:7777/api/v1/commands/&lt;name&gt;</code> with a JSON object of arguments and <code>Authorization: Bearer &lt;token&gt;</code>. Responses are <code>{"ok": true, "result": …}</code> or <code>{"ok": false, "error": {code, message, hint, field}}</code>.${links.rest ? ` See <a href="${links.rest}">REST API</a>.` : ''}`,
        `<strong>MCP:</strong> the tool name is the command name with dots replaced by underscores (<code>timeline.segment.split</code> → <code>timeline_segment_split</code>).${links.mcp ? ` See <a href="${links.mcp}">MCP setup</a>.` : ''}`,
        `<strong>CLI:</strong> <code>kadrctl run &lt;name&gt; --param value</code>; <code>kadrctl describe &lt;name&gt;</code> prints the same documentation.${links.cli ? ` See <a href="${links.cli}">kadrctl</a>.` : ''}`,
      ],
      conventionItems: (c) => [
        'All times are integer <strong>microseconds</strong> (<code>2500000</code> = 2.5 s) in parameters ending in <code>_us</code>. <code>kadrctl</code> also accepts <code>2.5s</code>, <code>1500ms</code> or <code>00:01:02.5</code>.',
        `Project-scoped commands take <code>project_id</code>; get it from ${c('project.list')} or ${c('project.create')}. Segment ids come from ${c('timeline.get')}.`,
        '<strong>Undoable</strong> commands create exactly one undo step; a batch of calls (<code>POST /api/v1/projects/{id}/batch</code> or the MCP tool <code>kadr_batch</code>) is one step too.',
        'Errors carry a machine-readable <code>code</code> and a <code>hint</code> that explains how to fix the call — written for AI agents.',
      ],
      filter: (n) => `Filter ${n} commands…`, filterLabel: 'Filter commands',
      count: (n) => plural.en(n, 'command', 'commands'),
      thCommand: 'Command', thTitle: 'Title', thCategory: 'Category',
      catLead: (n, name) => `${plural.en(n, 'command', 'commands')} in the ${name} category. Each one works the same from the editor UI, REST, MCP and <code>kadrctl</code>.`,
      catTitle: (name) => `${name} commands`,
      catDescription: (name, list) => `Kadr ${name} commands: ${list}.`,
      params: 'Parameters', returns: 'Returns', examples: 'Examples', noParams: 'No parameters.',
      thParam: 'Parameter', thType: 'Type', thDesc: 'Description', required: 'required',
      oneOf: 'One of', def: 'Default', range: 'Range',
      hotkey: 'Hotkey in the editor', undoable: 'Undoable', undoableTip: 'Creates one undo step (edit.undo)',
      noUndo: 'No undo step', noUndoTip: 'Does not change the project history', uiTip: 'Where it lives in the editor UI', mcpTip: 'MCP tool name',
      englishNote: '',
      cats: {},
    },
    search: {
      placeholder: 'Search guides, AI docs and commands…', help: 'to move · <kbd>Enter</kbd> to open · try “split”, “captions”, “4k”',
      groups: { guide: 'Guide', ai: 'AI docs', cmd: 'Commands' }, kinds: { guide: 'guide', ai: 'ai', cmd: 'cmd' },
      empty: 'No results for “{q}”. Try a command name like <code>split</code> or a task like “captions”.', loadError: 'The search index could not be loaded.',
      suggested: 'Suggested', label: 'Search', results: 'Results',
    },
    redirect: { title: 'Moved', text: 'This page has moved to', },
    site: {
      sideTitle: 'Kadr', docsGroup: 'Documentation',
    },
  },

  uk: {
    code: 'uk', name: 'Українська', short: 'УК', locale: 'uk_UA',
    skip: 'Перейти до змісту',
    nav: {
      main: 'Головне меню', home: 'Kadr — головна', docs: 'Документація', guide: 'Для людей', ai: 'Для ШІ', reference: 'Команди',
      changelog: 'Зміни', features: 'Можливості', api: 'API', captions: 'Субтитри', smart: 'Розумні інструменти',
      download: 'Завантажити', downloadLong: 'Завантажити Kadr', menu: 'Меню', github: 'Kadr на GitHub',
      language: 'Мова', theme: 'Перемкнути темну чи світлу тему', search: 'Пошук у документації',
    },
    footer: {
      tagline: 'Відеоредактор, яким може керувати ваш ШІ. Безкоштовно для Windows 10 і 11 — macOS на підході.',
      product: 'Продукт', download: 'Завантажити', features: 'Можливості', changelog: 'Історія змін', requirements: 'Вимоги',
      docs: 'Документація', guide: 'Посібник користувача', ai: 'Документація для ШІ', reference: 'Довідник команд', mcp: 'Підключити Claude (MCP)', llms: 'llms.txt для ШІ',
      kadr: 'Kadr', faq: 'Питання й відповіді', privacy: 'Приватність', licenses: 'Ліцензії', bug: 'Повідомити про помилку', github: 'GitHub',
      copy: '© 2026 Kadr. Безкоштовна програма для Windows · macOS незабаром.', notAffiliated: 'Не пов’язано з ByteDance чи CapCut.',
    },
    docs: {
      title: 'Документація', crumbsDocs: 'Документація', onThisPage: 'На цій сторінці', backToTop: 'Догори',
      prev: 'Назад', next: 'Далі', menu: 'Меню документації', close: 'Закрити меню', searchDocs: 'Пошук',
      copy: 'Копіювати', copyCode: 'Копіювати код', linkTo: 'Посилання на цей розділ', codeExamples: 'Приклади коду',
      minRead: (n) => `${n} хв читання`,
      untranslated: 'Цю сторінку ще не перекладено українською — нижче оригінал англійською.',
      untranslatedTitle: 'Ще не перекладено',
      sections: {
        guide: { short: 'Для людей', title: 'Посібник користувача', kicker: 'Для людей', desc: 'Як монтувати відео в Kadr: інтерфейс, таймлайн, текст і субтитри, ефекти, звук, експорт і всі гарячі клавіші.' },
        ai: { short: 'Для ШІ', title: 'Документація для ШІ', kicker: 'Для ШІ-агентів', desc: 'Як Claude та інші ШІ-агенти керують Kadr через MCP, REST і CLI: концепції, перевірка результату, найкращі практики, рецепти й повний довідник команд.' },
        site: { short: 'Kadr', title: 'Kadr' },
      },
      allTopics: 'Усі розділи',
      sectionHome: 'Почніть тут',
      comingSoonTitle: 'Незабаром',
      comingSoon: {
        guide: 'Посібник користувача саме пишеться: встановлення, огляд інтерфейсу, монтаж на таймлайні, текст, субтитри, ефекти, звук, експорт і всі гарячі клавіші — українською та англійською.',
        ai: 'Документація для ШІ саме пишеться: швидкий старт MCP для Claude, REST API, kadrctl, концепції, рецепти й найкращі практики — українською та англійською.',
      },
      meanwhile: 'А поки що',
      pagesCount: (n) => plural.uk(n, 'сторінка', 'сторінки', 'сторінок'),
      morePages: (n) => `і ще ${n}`,
      open: { guide: 'Відкрити посібник', ai: 'Відкрити документацію для ШІ' },
    },
    hub: {
      title: 'Документація',
      description: 'Документація Kadr із двох частин: посібник для людей, які монтують, і документація для ШІ-агентів, які монтують за них, — MCP, REST, CLI і кожна команда.',
      eyebrow: 'Документація Kadr',
      h1a: 'Опануйте Kadr.', h1b: 'Або навчіть свій ШІ.',
      sub: 'Дві документації для двох типів монтажерів: людей, які клацають, і агентів, які викликають команди. Той самий редактор, та сама історія скасувань.',
      searchPlaceholder: 'Шукайте в посібнику, документації для ШІ та командах…',
      humans: { kicker: 'Для людей', title: 'Посібник користувача', text: 'Опануйте редактор: інтерфейс, таймлайн, текст і субтитри, ефекти й колір, звук, ШІ-інструменти, експорт і всі гарячі клавіші.', cta: 'Відкрити посібник' },
      ai: { kicker: 'Для ШІ-агентів', title: 'Документація для ШІ', text: 'Підключіть Claude чи будь-який MCP-клієнт, викликайте REST API або kadrctl, спирайтеся на концепції й рецепти — кожну з {n} команд задокументовано.', cta: 'Відкрити документацію для ШІ' },
      quick: 'Швидкі посилання',
      q: {
        install: ['Встановити Kadr', 'Інсталятор для Windows 10 і 11, перший запуск, FFmpeg'],
        mcp: ['Підключити Claude', 'Налаштування MCP для Claude Desktop, Claude Code та інших'],
        reference: ['Довідник команд', 'Усі команди ({n}) з параметрами та прикладами'],
        llms: ['llms.txt', 'Машинозчитуваний індекс документації для LLM'],
        openapi: ['openapi.json', 'Специфікація OpenAPI 3.1 для кожної команди'],
        changelog: ['Історія змін', 'Що нового в кожному випуску'],
      },
      soon: 'Незабаром',
    },
    ref: {
      title: 'Довідник команд', crumb: 'Команди', groupTitle: 'Довідник команд', all: 'Усі команди',
      lead: (n) => `Кожна дія в Kadr — це одна з цих ${n} команд. Кнопки редактора, REST API, MCP-інструменти та <code>kadrctl</code> викликають той самий реєстр, тож ця сторінка — повна мапа того, що вміє редактор.`,
      description: (n) => `Усі ${plural.uk(n, 'команда', 'команди', 'команд')} Kadr — той самий API, що стоїть за кожною кнопкою, для REST, MCP і kadrctl.`,
      calling: 'Як викликати команду', conventions: 'Домовленості', categories: 'Категорії', allCommands: 'Усі команди',
      callingItems: (root, links) => [
        `<strong>REST:</strong> <code>POST http://127.0.0.1:7777/api/v1/commands/&lt;name&gt;</code> з JSON-об’єктом аргументів і заголовком <code>Authorization: Bearer &lt;token&gt;</code>. Відповідь — <code>{"ok": true, "result": …}</code> або <code>{"ok": false, "error": {code, message, hint, field}}</code>.${links.rest ? ` Докладніше — <a href="${links.rest}">REST API</a>.` : ''}`,
        `<strong>MCP:</strong> назва інструмента — це назва команди, де крапки замінено на підкреслення (<code>timeline.segment.split</code> → <code>timeline_segment_split</code>).${links.mcp ? ` Докладніше — <a href="${links.mcp}">налаштування MCP</a>.` : ''}`,
        `<strong>CLI:</strong> <code>kadrctl run &lt;name&gt; --param value</code>; <code>kadrctl describe &lt;name&gt;</code> виводить цю саму документацію.${links.cli ? ` Докладніше — <a href="${links.cli}">kadrctl</a>.` : ''}`,
      ],
      conventionItems: (c) => [
        'Увесь час задається цілими <strong>мікросекундами</strong> (<code>2500000</code> = 2,5 с) у параметрах із суфіксом <code>_us</code>. <code>kadrctl</code> також приймає <code>2.5s</code>, <code>1500ms</code> або <code>00:01:02.5</code>.',
        `Команди в межах проєкту приймають <code>project_id</code> — візьміть його з ${c('project.list')} або ${c('project.create')}. Ідентифікатори сегментів повертає ${c('timeline.get')}.`,
        'Команди з позначкою <strong>«Скасовується»</strong> створюють рівно один крок скасування; пакет викликів (<code>POST /api/v1/projects/{id}/batch</code> або MCP-інструмент <code>kadr_batch</code>) — теж один крок.',
        'Помилки містять машинозчитуваний <code>code</code> і підказку <code>hint</code>, як виправити виклик, — написану для ШІ-агентів.',
      ],
      filter: (n) => `Фільтр серед ${n} команд…`, filterLabel: 'Фільтр команд',
      count: (n) => plural.uk(n, 'команда', 'команди', 'команд'),
      thCommand: 'Команда', thTitle: 'Назва', thCategory: 'Категорія',
      catLead: (n, name) => `${plural.uk(n, 'команда', 'команди', 'команд')} у категорії «${name}». Кожна працює однаково з інтерфейсу редактора, через REST, MCP і <code>kadrctl</code>.`,
      catTitle: (name) => `${name}: команди`,
      catDescription: (name, list) => `Команди Kadr у категорії «${name}»: ${list}.`,
      params: 'Параметри', returns: 'Повертає', examples: 'Приклади', noParams: 'Без параметрів.',
      thParam: 'Параметр', thType: 'Тип', thDesc: 'Опис', required: 'обов’язковий',
      oneOf: 'Одне з', def: 'Типово', range: 'Діапазон',
      hotkey: 'Гаряча клавіша в редакторі', undoable: 'Скасовується', undoableTip: 'Створює один крок скасування (edit.undo)',
      noUndo: 'Без кроку скасування', noUndoTip: 'Не змінює історію проєкту', uiTip: 'Де це в інтерфейсі редактора', mcpTip: 'Назва MCP-інструмента',
      englishNote: 'Описи команд і параметрів залишено англійською навмисно: це дослівно той самий текст, який ШІ-агенти отримують через MCP та OpenAPI, тож тут ви бачите саме те, що бачить агент. Решту сторінки перекладено.',
      cats: {
        'Adjustment': 'Корекція', 'Animation': 'Анімація', 'App': 'Застосунок', 'Audio': 'Аудіо', 'Audio properties': 'Властивості аудіо',
        'Captions': 'Субтитри', 'Edit': 'Редагування', 'Effects': 'Ефекти', 'Export': 'Експорт', 'Filters': 'Фільтри', 'Fonts': 'Шрифти',
        'Keyframes': 'Ключові кадри', 'Library': 'Бібліотека', 'Media': 'Медіа', 'Playback': 'Відтворення', 'Presets': 'Пресети',
        'Projects': 'Проєкти', 'Smart tools': 'Розумні інструменти', 'Speed': 'Швидкість', 'Stickers': 'Стікери', 'Text': 'Текст',
        'Timeline': 'Таймлайн', 'Tools': 'Інструменти', 'Transcript': 'Транскрипт', 'Transitions': 'Переходи', 'Updates': 'Оновлення',
        'Video': 'Відео', 'Video properties': 'Властивості відео', 'Window': 'Вікно', 'Other': 'Інше',
      },
    },
    search: {
      placeholder: 'Шукайте в посібнику, документації для ШІ та командах…', help: 'навігація · <kbd>Enter</kbd> — відкрити · спробуйте «split», «субтитри», «4k»',
      groups: { guide: 'Посібник', ai: 'Для ШІ', cmd: 'Команди' }, kinds: { guide: 'посібник', ai: 'ші', cmd: 'cmd' },
      empty: 'Нічого не знайдено за запитом «{q}». Спробуйте назву команди, як-от <code>split</code>, або задачу, як-от «субтитри».', loadError: 'Не вдалося завантажити пошуковий індекс.',
      suggested: 'Рекомендовано', label: 'Пошук', results: 'Результати',
    },
    redirect: { title: 'Сторінку переміщено', text: 'Сторінка тепер тут:' },
    site: { sideTitle: 'Kadr', docsGroup: 'Документація' },
  },
};

/** Category display name in a language (slugs and anchors stay English). */
export const catName = (lang, name) => (T[lang].ref.cats[name] || name);
