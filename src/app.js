(function (global) {
  'use strict';

  var DEFAULT_SETTINGS = {
    apiBase: 'https://ddys.io/api/v1',
    apiKey: '',
    apiKeyMode: 'query',
    apiKeyQuery: 'api_key',
    pageSize: 24,
    cacheTtlSeconds: 600,
    directOnly: false,
    includeExternal: true
  };
  var KEY_CODES = {
    enter: 13,
    left: 37,
    up: 38,
    right: 39,
    down: 40,
    back: 461,
    browserBack: 10009,
    escape: 27,
    play: 415,
    pause: 19,
    stop: 413,
    rewind: 412,
    forward: 417,
    playPause: 10252,
    red: 403,
    green: 404,
    yellow: 405,
    blue: 406
  };

  var store = global.DDYSStore.create('ddys-webos');
  var settings = merge(DEFAULT_SETTINGS, store.read('settings', DEFAULT_SETTINGS));
  var favorites = store.read('favorites', []);
  var history = store.read('history', []);
  var progress = store.read('progress', {});
  var screen = null;
  var statusLine = null;
  var toast = null;
  var focus = null;
  var player = null;
  var client = null;
  var activeView = 'home';
  var lastList = [];

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    screen = document.getElementById('screen');
    statusLine = document.getElementById('statusLine');
    toast = document.getElementById('toast');
    focus = global.DDYSFocus.create({ selector: '[data-focusable]' });
    player = global.DDYSPlayer.create({ onStop: recordPlayback, onProgress: recordProgress });
    client = global.DDYSClient.create(settings);
    bindEvents();
    setStatus('LG webOS 电视端已就绪');
    renderHome();
  }

  function bindEvents() {
    document.getElementById('mainNav').addEventListener('click', function (event) {
      var button = closest(event.target, '[data-view]');
      if (!button) return;
      openView(button.getAttribute('data-view'));
    });
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleAction);
    window.addEventListener('popstate', function (event) {
      event.preventDefault();
      handleBack();
    });
    try {
      historyReplace();
    } catch (error) {}
  }

  function handleKey(event) {
    var code = event.keyCode || event.which;
    if (player && player.isActive()) {
      if (code === KEY_CODES.back || code === KEY_CODES.browserBack || code === KEY_CODES.escape || code === KEY_CODES.stop) {
        event.preventDefault();
        player.stop();
        focus.refresh();
        return;
      }
      if (code === KEY_CODES.left || code === KEY_CODES.rewind) {
        event.preventDefault();
        player.seek(-15);
        return;
      }
      if (code === KEY_CODES.right || code === KEY_CODES.forward) {
        event.preventDefault();
        player.seek(30);
        return;
      }
      if (code === KEY_CODES.enter || code === KEY_CODES.playPause || code === KEY_CODES.play || code === KEY_CODES.pause) {
        event.preventDefault();
        player.toggle();
        return;
      }
    }

    if (code === KEY_CODES.left) { event.preventDefault(); focus.move('left'); return; }
    if (code === KEY_CODES.right) { event.preventDefault(); focus.move('right'); return; }
    if (code === KEY_CODES.up) { event.preventDefault(); focus.move('up'); return; }
    if (code === KEY_CODES.down) { event.preventDefault(); focus.move('down'); return; }
    if (code === KEY_CODES.enter) { event.preventDefault(); focus.click(); return; }
    if (code === KEY_CODES.back || code === KEY_CODES.browserBack || code === KEY_CODES.escape) {
      event.preventDefault();
      handleBack();
      return;
    }
    if (code === KEY_CODES.red) openView('search');
    if (code === KEY_CODES.green) openView('favorites');
    if (code === KEY_CODES.yellow) openView('history');
    if (code === KEY_CODES.blue) openView('settings');
  }

  function handleBack() {
    if (activeView !== 'home') openView('home');
    else toastText('已在首页');
  }

  function handleAction(event) {
    var action = closest(event.target, '[data-action]');
    var playerAction = closest(event.target, '[data-player-action]');
    if (playerAction) {
      runPlayerAction(playerAction.getAttribute('data-player-action'));
      return;
    }
    if (!action) return;
    runAction(action.getAttribute('data-action'), action);
  }

  function runPlayerAction(action) {
    if (action === 'toggle') player.toggle();
    if (action === 'seek-back') player.seek(-15);
    if (action === 'seek-forward') player.seek(30);
    if (action === 'stop') {
      player.stop();
      focus.refresh();
    }
  }

  function runAction(action, node) {
    var slug = node.getAttribute('data-slug');
    var value = node.getAttribute('data-value');
    if (action === 'category') renderCategory(value);
    if (action === 'detail') renderDetail(slug);
    if (action === 'play') playResource(Number(value));
    if (action === 'resume') resumeMovie(slug);
    if (action === 'favorite') toggleFavorite(slug);
    if (action === 'save-settings') saveSettings();
    if (action === 'clear-cache') clearCache();
    if (action === 'clear-history') clearHistory();
    if (action === 'clear-progress') clearProgress();
    if (action === 'run-search') runSearch();
    if (action === 'run-check') renderCheck();
    if (action === 'settings') openView('settings');
  }

  function openView(view) {
    activeView = view;
    updateNav(view);
    if (view === 'home') renderHome();
    if (view === 'search') renderSearch();
    if (view === 'favorites') renderFavorites();
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
    if (view === 'check') renderCheck();
  }

  function renderHome() {
    activeView = 'home';
    updateNav('home');
    setLoading('正在读取首页');
    Promise.all([client.latest(settings.pageSize), client.hot(settings.pageSize)]).then(function (results) {
      lastList = results[0].concat(results[1]);
      screen.innerHTML = [
        heroHtml(),
        continueHtml(),
        categoryHtml(client.categories()),
        rowHtml('最新更新', results[0]),
        rowHtml('热门推荐', results[1])
      ].join('');
      focus.refresh();
      setStatus('首页已更新');
    }).catch(showError);
  }

  function renderCategory(type) {
    activeView = 'category';
    setLoading('正在读取分类');
    var category = findCategory(type);
    var promise = type === 'latest' ? client.latest(settings.pageSize) :
      type === 'hot' ? client.hot(settings.pageSize) :
      client.movies(type, 1, settings.pageSize);
    promise.then(function (items) {
      lastList = items;
      screen.innerHTML = '<section class="view-head"><h2>' + escapeHtml(category.title || type) + '</h2><p>方向键或 Magic Remote 选择影片。</p></section>' + gridHtml(items);
      focus.refresh();
      setStatus((category.title || type) + ' 已更新');
    }).catch(showError);
  }

  function renderSearch() {
    activeView = 'search';
    updateNav('search');
    screen.innerHTML = [
      '<section class="view-head"><h2>搜索</h2><p>可用遥控器输入法或 Magic Remote 指针输入。</p></section>',
      '<section class="search-bar">',
      '<input data-focusable id="searchInput" type="search" value="" placeholder="输入片名">',
      '<button data-focusable data-action="run-search">搜索</button>',
      '</section>',
      '<section id="searchResult" class="movie-grid"></section>'
    ].join('');
    focus.refresh(document.getElementById('searchInput'));
  }

  function runSearch() {
    var input = document.getElementById('searchInput');
    var result = document.getElementById('searchResult');
    var query = input ? input.value.replace(/^\s+|\s+$/g, '') : '';
    if (!query) {
      toastText('请输入搜索内容');
      return;
    }
    result.innerHTML = '<div class="empty">搜索中...</div>';
    client.search(query, 1, settings.pageSize).then(function (items) {
      lastList = items;
      result.outerHTML = gridHtml(items);
      focus.refresh();
      setStatus('搜索完成：' + query);
    }).catch(showError);
  }

  function renderDetail(slug) {
    if (!slug) return;
    activeView = 'detail';
    setLoading('正在读取详情');
    client.movieWithResources(slug).then(function (data) {
      var movie = data.movie;
      var resources = data.resources;
      var fav = isFavorite(movie.slug || movie.id);
      var resume = progress[movie.slug || movie.id];
      lastList = [movie];
      global.__ddysCurrentDetail = { movie: movie, resources: resources };
      screen.innerHTML = [
        '<section class="detail">',
        '<div class="detail-poster">' + posterHtml(movie) + '</div>',
        '<div class="detail-main">',
        '<p class="eyebrow">' + escapeHtml([movie.year, movie.type, movie.region, movie.rating].filter(Boolean).join(' / ')) + '</p>',
        '<h2>' + escapeHtml(movie.title || slug) + '</h2>',
        '<p class="summary">' + escapeHtml(movie.summary || movie.subtitle || '暂无简介') + '</p>',
        '<div class="detail-actions">',
        resume ? '<button data-focusable data-action="resume" data-slug="' + escapeAttr(movie.slug || movie.id) + '">继续观看 ' + escapeHtml(formatDuration(resume.position)) + '</button>' : '',
        '<button data-focusable data-action="favorite" data-slug="' + escapeAttr(movie.slug || movie.id) + '">' + (fav ? '取消收藏' : '加入收藏') + '</button>',
        '</div>',
        '<h3>播放资源</h3>',
        resourceListHtml(resources),
        '</div>',
        '</section>'
      ].join('');
      focus.refresh();
      setStatus('详情已打开');
    }).catch(showError);
  }

  function playResource(index, resumeSeconds) {
    var detail = global.__ddysCurrentDetail;
    var resource;
    if (!detail || !detail.resources) return;
    resource = detail.resources[index];
    if (!resource) return;
    if (!resource.playable) {
      toastText('该资源不是电视可直接播放链接');
      return;
    }
    player.open(resource, detail.movie, resumeSeconds || 0);
  }

  function resumeMovie(slug) {
    var detail = global.__ddysCurrentDetail;
    var saved = progress[slug];
    var index = 0;
    if (!detail || !saved) return;
    for (var i = 0; i < detail.resources.length; i += 1) {
      if (detail.resources[i].url === saved.resourceUrl) index = i;
    }
    playResource(index, saved.position || 0);
  }

  function renderFavorites() {
    activeView = 'favorites';
    updateNav('favorites');
    screen.innerHTML = '<section class="view-head"><h2>收藏</h2><p>收藏会保存在电视本地。</p></section>' + gridHtml(favorites);
    focus.refresh();
  }

  function renderHistory() {
    activeView = 'history';
    updateNav('history');
    screen.innerHTML = [
      '<section class="view-head"><h2>观看历史</h2><p>记录最近播放的影片、资源和进度。</p><div><button data-focusable data-action="clear-progress">清进度</button><button data-focusable data-action="clear-history">清历史</button></div></section>',
      historyHtml()
    ].join('');
    focus.refresh();
  }

  function renderSettings() {
    activeView = 'settings';
    updateNav('settings');
    screen.innerHTML = [
      '<section class="settings">',
      '<div class="view-head"><h2>设置</h2><p>配置 DDYS API 和资源展示策略。</p></div>',
      formRow('API Base', 'apiBase', settings.apiBase, 'text'),
      formRow('API Key', 'apiKey', settings.apiKey, 'password'),
      selectRow('API Key 模式', 'apiKeyMode', settings.apiKeyMode, [['query', 'Query'], ['bearer', 'Bearer'], ['header', 'Header']]),
      formRow('API Key Query', 'apiKeyQuery', settings.apiKeyQuery, 'text'),
      formRow('每页数量', 'pageSize', settings.pageSize, 'number'),
      formRow('缓存秒数', 'cacheTtlSeconds', settings.cacheTtlSeconds, 'number'),
      toggleRow('只显示直连播放资源', 'directOnly', settings.directOnly),
      toggleRow('显示网盘/磁力等外部资源', 'includeExternal', settings.includeExternal),
      '<div class="form-actions"><button data-focusable data-action="save-settings">保存设置</button><button data-focusable data-action="clear-cache">清理缓存</button></div>',
      '</section>'
    ].join('');
    focus.refresh();
  }

  function renderCheck() {
    activeView = 'check';
    updateNav('check');
    var playerCheck = player.selfCheck();
    var checks = [
      ['webOS 环境', playerCheck.webos || isWebOsLike()],
      ['PalmSystem', !!global.PalmSystem],
      ['webOS 对象', !!global.webOS],
      ['HTML5 video', playerCheck.video],
      ['MP4 播放能力', playerCheck.mp4 || '未知'],
      ['HLS 播放能力', playerCheck.hlsLikely || '由电视固件决定'],
      ['本地存储', !!store.write('__check', { ok: true })],
      ['API Base', settings.apiBase]
    ];
    screen.innerHTML = [
      '<section class="view-head"><h2>自检</h2><p>检查 webOS 运行环境、视频能力和配置。</p><button data-focusable data-action="run-check">重新检测</button></section>',
      '<section class="check-list">',
      checks.map(function (item) {
        return '<div class="check-item"><span>' + escapeHtml(item[0]) + '</span><strong class="' + (item[1] === true ? 'ok' : 'warn') + '">' + escapeHtml(item[1] === true ? '正常' : item[1] || '不可用') + '</strong></div>';
      }).join(''),
      '</section>'
    ].join('');
    focus.refresh();
    pingApi();
  }

  function pingApi() {
    client.latest(1).then(function () {
      setStatus('API 连接正常');
    }).catch(function (error) {
      setStatus('API 连接失败：' + (error && error.message ? error.message : error));
    });
  }

  function saveSettings() {
    settings = {
      apiBase: valueOf('apiBase') || DEFAULT_SETTINGS.apiBase,
      apiKey: valueOf('apiKey'),
      apiKeyMode: valueOf('apiKeyMode') || 'query',
      apiKeyQuery: valueOf('apiKeyQuery') || 'api_key',
      pageSize: readNumber(valueOf('pageSize'), 24),
      cacheTtlSeconds: readNumber(valueOf('cacheTtlSeconds'), 600),
      directOnly: checkedOf('directOnly'),
      includeExternal: checkedOf('includeExternal')
    };
    settings = global.DDYSClient.normalizeSettings(settings);
    store.write('settings', settings);
    client = global.DDYSClient.create(settings);
    toastText('设置已保存');
    renderHome();
  }

  function clearCache() {
    client.clearCache();
    toastText('缓存已清理');
  }

  function clearHistory() {
    history = [];
    store.write('history', history);
    renderHistory();
  }

  function clearProgress() {
    progress = {};
    store.write('progress', progress);
    renderHistory();
  }

  function toggleFavorite(slug) {
    var detail = global.__ddysCurrentDetail;
    var movie = detail && detail.movie;
    if (!movie) return;
    if (isFavorite(slug)) favorites = favorites.filter(function (item) { return (item.slug || item.id) !== slug; });
    else favorites.unshift(movie);
    favorites = uniqueMovies(favorites).slice(0, 200);
    store.write('favorites', favorites);
    renderDetail(slug);
  }

  function recordPlayback(current) {
    var movie = current.movie || {};
    var resource = current.resource || {};
    if (!movie.slug && !movie.id) return;
    recordProgress(current);
    history.unshift({
      id: movie.id,
      slug: movie.slug || movie.id,
      title: movie.title,
      poster: movie.poster,
      year: movie.year,
      type: movie.type,
      resourceTitle: resource.title,
      resourceUrl: resource.url,
      position: current.position || 0,
      duration: current.duration || 0,
      playedAt: new Date().toISOString()
    });
    history = uniqueMovies(history).slice(0, 100);
    store.write('history', history);
  }

  function recordProgress(current) {
    var movie = current.movie || {};
    var resource = current.resource || {};
    var slug = movie.slug || movie.id;
    if (!slug || !resource.url) return;
    progress[slug] = {
      slug: slug,
      title: movie.title,
      poster: movie.poster,
      resourceTitle: resource.title,
      resourceUrl: resource.url,
      position: current.position || 0,
      duration: current.duration || 0,
      updatedAt: new Date().toISOString()
    };
    store.write('progress', progress);
  }

  function heroHtml() {
    return '<section class="hero"><div><p class="eyebrow">LG webOS TV</p><h2>在 LG 电视上浏览 DDYS</h2><p>方向键移动，确认键打开，返回键回首页，Magic Remote 可直接指向点击。</p></div></section>';
  }

  function continueHtml() {
    var items = Object.keys(progress).map(function (key) { return progress[key]; }).sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    }).slice(0, 8);
    if (!items.length) return '';
    return '<section class="movie-row"><h3>继续观看</h3><div class="continue-row">' + items.map(function (item) {
      return '<button data-focusable class="continue-card" data-action="detail" data-slug="' + escapeAttr(item.slug) + '">' +
        '<strong>' + escapeHtml(item.title || item.slug) + '</strong>' +
        '<small>' + escapeHtml([item.resourceTitle, formatDuration(item.position)].filter(Boolean).join(' / ')) + '</small>' +
        '</button>';
    }).join('') + '</div></section>';
  }

  function categoryHtml(categories) {
    return '<section class="category-strip">' + categories.map(function (category) {
      return '<button data-focusable data-action="category" data-value="' + escapeAttr(category.type || category.id) + '">' + escapeHtml(category.title) + '</button>';
    }).join('') + '</section>';
  }

  function rowHtml(title, items) {
    return '<section class="movie-row"><h3>' + escapeHtml(title) + '</h3><div class="poster-row">' + items.map(movieCardHtml).join('') + '</div></section>';
  }

  function gridHtml(items) {
    if (!items || !items.length) return '<section class="empty">没有内容。</section>';
    return '<section class="movie-grid">' + items.map(movieCardHtml).join('') + '</section>';
  }

  function movieCardHtml(movie) {
    return '<button data-focusable class="movie-card" data-action="detail" data-slug="' + escapeAttr(movie.slug || movie.id) + '">' +
      posterHtml(movie) +
      '<span class="movie-title">' + escapeHtml(movie.title || movie.slug || 'Untitled') + '</span>' +
      '<small>' + escapeHtml([movie.year, movie.type, movie.rating].filter(Boolean).join(' / ')) + '</small>' +
      '</button>';
  }

  function posterHtml(movie) {
    if (movie && movie.poster) return '<img src="' + escapeAttr(movie.poster) + '" alt="">';
    return '<span class="poster-fallback">DDYS</span>';
  }

  function resourceListHtml(resources) {
    if (!resources || !resources.length) return '<div class="empty">没有可展示资源。</div>';
    return '<div class="resource-list">' + resources.map(function (resource, index) {
      return '<button data-focusable class="resource-item" data-action="play" data-value="' + index + '">' +
        '<span><strong>' + escapeHtml(resource.title || 'Resource') + '</strong><small>' + escapeHtml(resource.group || '') + '</small></span>' +
        '<em class="' + (resource.playable ? 'ok' : 'warn') + '">' + escapeHtml(resource.kind || 'unknown') + '</em>' +
        '</button>';
    }).join('') + '</div>';
  }

  function historyHtml() {
    if (!history.length) return '<section class="empty">还没有观看历史。</section>';
    return '<section class="history-list">' + history.map(function (item) {
      return '<button data-focusable class="history-item" data-action="detail" data-slug="' + escapeAttr(item.slug) + '">' +
        '<strong>' + escapeHtml(item.title || item.slug) + '</strong>' +
        '<small>' + escapeHtml([item.resourceTitle, formatDuration(item.position), formatTime(item.playedAt)].filter(Boolean).join(' / ')) + '</small>' +
        '</button>';
    }).join('') + '</section>';
  }

  function formRow(label, name, value, type) {
    return '<label class="form-row"><span>' + escapeHtml(label) + '</span><input data-focusable id="' + escapeAttr(name) + '" type="' + type + '" value="' + escapeAttr(value) + '"></label>';
  }

  function selectRow(label, name, value, options) {
    return '<label class="form-row"><span>' + escapeHtml(label) + '</span><select data-focusable id="' + escapeAttr(name) + '">' + options.map(function (item) {
      return '<option value="' + escapeAttr(item[0]) + '"' + (item[0] === value ? ' selected' : '') + '>' + escapeHtml(item[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  function toggleRow(label, name, value) {
    return '<label class="form-row switch"><span>' + escapeHtml(label) + '</span><input data-focusable id="' + escapeAttr(name) + '" type="checkbox"' + (value ? ' checked' : '') + '></label>';
  }

  function updateNav(view) {
    Array.prototype.slice.call(document.querySelectorAll('[data-view]')).forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-view') === view);
    });
  }

  function setLoading(text) {
    setStatus(text);
    screen.innerHTML = '<section class="empty">' + escapeHtml(text) + '...</section>';
  }

  function showError(error) {
    var message = error && error.message ? error.message : String(error);
    screen.innerHTML = '<section class="error"><h2>加载失败</h2><p>' + escapeHtml(message) + '</p><button data-focusable data-action="settings">检查设置</button></section>';
    setStatus('加载失败：' + message);
    focus.refresh();
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function toastText(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function findCategory(type) {
    var categories = client.categories();
    var i;
    for (i = 0; i < categories.length; i += 1) {
      if (categories[i].id === type || categories[i].type === type) return categories[i];
    }
    return { title: type };
  }

  function isFavorite(slug) {
    return favorites.some(function (item) { return (item.slug || item.id) === slug; });
  }

  function uniqueMovies(items) {
    var seen = {};
    return items.filter(function (item) {
      var key = item.slug || item.id || item.title;
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function valueOf(id) {
    var node = document.getElementById(id);
    return node ? node.value : '';
  }

  function checkedOf(id) {
    var node = document.getElementById(id);
    return !!(node && node.checked);
  }

  function readNumber(value, fallback) {
    var number = Number(value);
    return isFinite(number) ? number : fallback;
  }

  function formatTime(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function formatDuration(seconds) {
    var value = Math.max(0, Number(seconds) || 0);
    var minutes = Math.floor(value / 60);
    var rest = Math.floor(value % 60);
    return minutes + ':' + (rest < 10 ? '0' : '') + rest;
  }

  function merge(base, extra) {
    var out = {};
    Object.keys(base || {}).forEach(function (key) { out[key] = base[key]; });
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function closest(node, selector) {
    while (node && node !== document) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function historyReplace() {
    if (global.history && global.history.replaceState) {
      global.history.replaceState({ ddys: true }, 'DDYS');
      global.history.pushState({ ddys: true }, 'DDYS');
    }
  }

  function isWebOsLike() {
    var ua = global.navigator && global.navigator.userAgent ? global.navigator.userAgent : '';
    return /web0s|webos|lg browser|netcast/i.test(ua);
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  global.DDYSWebOSApp = {
    boot: boot,
    openView: openView,
    getSettings: function () { return settings; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
