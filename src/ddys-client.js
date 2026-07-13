(function (global) {
  'use strict';

  var VERSION = '0.1.0';
  var MOVIE_ARRAY_KEYS = ['items', 'results', 'movies', 'records', 'list', 'data'];
  var RESOURCE_ARRAY_KEYS = [
    'items', 'resources', 'resource', 'resource_url', 'resourceUrl',
    'source', 'sources', 'source_url', 'sourceUrl',
    'urls', 'links', 'list', 'playlist', 'episodes', 'play', 'online',
    'stream', 'streams', 'stream_url', 'streamUrl',
    'video', 'videos', 'video_url', 'videoUrl',
    'file', 'files', 'file_url', 'fileUrl',
    'download', 'downloads', 'magnets', 'magnet', 'cloud', 'netdisk', 'drive'
  ];
  var PLAYABLE_SUFFIXES = ['.m3u8', '.mpd', '.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.flv', '.ts', '.m2ts', '.wmv', '.mp3', '.aac', '.flac'];
  var CATEGORIES = [
    { id: 'latest', title: '最新更新', endpoint: 'latest' },
    { id: 'hot', title: '热门推荐', endpoint: 'hot' },
    { id: 'movie', title: '电影', type: 'movie' },
    { id: 'series', title: '剧集', type: 'series' },
    { id: 'anime', title: '动画', type: 'anime' },
    { id: 'variety', title: '综艺', type: 'variety' },
    { id: 'documentary', title: '纪录片', type: 'documentary' }
  ];

  function createClient(settings, dependencies) {
    var options = normalizeSettings(settings || {});
    var deps = dependencies || {};
    var cache = {};

    function request(path, params) {
      var url = buildUrl(options, path, params || {});
      var hit = readCache(cache, url, options.cacheTtlSeconds);
      if (hit !== undefined) return Promise.resolve(hit);
      return httpJson(url, buildHeaders(options), deps).then(function (json) {
        writeCache(cache, url, json);
        return json;
      });
    }

    return {
      settings: options,
      categories: function () { return CATEGORIES.slice(); },
      latest: function (limit) {
        return request('/latest', { limit: limit || options.pageSize }).then(readMovies);
      },
      hot: function (limit) {
        return request('/hot', { limit: limit || options.pageSize }).then(readMovies);
      },
      movies: function (type, page, perPage) {
        return request('/movies', { type: type, page: page || 1, per_page: perPage || options.pageSize, limit: perPage || options.pageSize }).then(readMovies);
      },
      search: function (query, page, perPage) {
        return request('/search', { q: query, page: page || 1, per_page: perPage || options.pageSize, limit: perPage || options.pageSize }).then(readMovies);
      },
      detail: function (slug) {
        return request('/movies/' + encodeURIComponent(slug), {}).then(function (root) {
          return normalizeMovie(unwrapData(root), 0) || { slug: slug, title: slug };
        });
      },
      resources: function (slug, movie) {
        return request('/movies/' + encodeURIComponent(slug) + '/sources', {}).then(function (root) {
          return readResources(root, movie, options);
        });
      },
      movieWithResources: function (slug) {
        var self = this;
        return self.detail(slug).then(function (movie) {
          return self.resources(slug, movie).then(function (resources) {
            return { movie: publicMovie(movie), resources: resources.map(publicResource) };
          });
        });
      },
      clearCache: function () { cache = {}; },
      cacheStats: function () { return { size: Object.keys(cache).length, ttlSeconds: options.cacheTtlSeconds }; }
    };
  }

  function normalizeSettings(settings) {
    return {
      apiBase: trimSlash(settings.apiBase || 'https://ddys.io/api/v1'),
      apiKey: settings.apiKey || '',
      apiKeyMode: allowed(settings.apiKeyMode, ['query', 'bearer', 'header'], 'query'),
      apiKeyQuery: settings.apiKeyQuery || 'api_key',
      pageSize: clampInt(settings.pageSize, 1, 100, 24),
      cacheTtlSeconds: clampInt(settings.cacheTtlSeconds, 0, 86400, 600),
      directOnly: !!settings.directOnly,
      includeExternal: settings.includeExternal !== false
    };
  }

  function buildUrl(settings, path, params) {
    var query = [];
    Object.keys(params || {}).forEach(function (name) {
      var value = params[name];
      if (value !== undefined && value !== null && value !== '') {
        query.push(encodeURIComponent(name) + '=' + encodeURIComponent(String(value)));
      }
    });
    if (settings.apiKey && settings.apiKeyMode === 'query') {
      query.push(encodeURIComponent(settings.apiKeyQuery || 'api_key') + '=' + encodeURIComponent(settings.apiKey));
    }
    return settings.apiBase + (path.charAt(0) === '/' ? path : '/' + path) + (query.length ? '?' + query.join('&') : '');
  }

  function buildHeaders(settings) {
    var headers = { accept: 'application/json' };
    if (settings.apiKey && settings.apiKeyMode === 'bearer') headers.authorization = 'Bearer ' + settings.apiKey;
    if (settings.apiKey && settings.apiKeyMode === 'header') headers['x-api-key'] = settings.apiKey;
    return headers;
  }

  function httpJson(url, headers, deps) {
    if (deps && typeof deps.request === 'function') return deps.request(url, headers);
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      Object.keys(headers || {}).forEach(function (name) {
        try { xhr.setRequestHeader(name, headers[name]); } catch (error) {}
      });
      xhr.timeout = 20000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('DDYS API HTTP ' + xhr.status));
          return;
        }
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = function () { reject(new Error('Network error')); };
      xhr.ontimeout = function () { reject(new Error('Request timeout')); };
      xhr.send();
    });
  }

  function readCache(cache, key, ttlSeconds) {
    if (!ttlSeconds) return undefined;
    var hit = cache[key];
    if (!hit) return undefined;
    if (Date.now() - hit.createdAt > ttlSeconds * 1000) {
      delete cache[key];
      return undefined;
    }
    return hit.value;
  }

  function writeCache(cache, key, value) {
    cache[key] = { createdAt: Date.now(), value: value };
  }

  function unwrapData(value) {
    var current = value;
    var guard = 0;
    while (current && typeof current === 'object' && !Array.isArray(current) && current.data !== undefined && guard < 5) {
      current = current.data;
      guard += 1;
    }
    return current;
  }

  function firstArray(value, keys) {
    var root = unwrapData(value);
    var i;
    var nested;
    if (Array.isArray(root)) return root;
    if (!root || typeof root !== 'object') return [];
    for (i = 0; i < keys.length; i += 1) {
      nested = unwrapData(root[keys[i]]);
      if (Array.isArray(nested)) return nested;
    }
    return [];
  }

  function readMovies(root) {
    return firstArray(root, MOVIE_ARRAY_KEYS).map(normalizeMovie).filter(Boolean).map(publicMovie);
  }

  function normalizeMovie(item, index) {
    var url;
    var slug;
    var title;
    if (typeof item === 'string') {
      slug = slugFromUrl(item) || item;
      return { id: String(index + 1), slug: slug, title: item, subtitle: '', year: '', type: '', region: '', rating: '', poster: '', url: item, summary: '', raw: item };
    }
    if (!item || typeof item !== 'object') return null;
    url = normalizeString(pick(item, ['url', 'link', 'permalink', 'href', 'share_url']));
    slug = normalizeString(pick(item, ['slug', 'id', 'uuid', 'key', 'code'])) || slugFromUrl(url);
    title = normalizeString(pick(item, ['title', 'name', 'zh', 'cn_name', 'display_name', 'original_title']), slug || 'Untitled');
    return {
      id: normalizeString(pick(item, ['id', 'uuid', 'key']), slug || String(index + 1)),
      slug: slug,
      title: title,
      subtitle: normalizeString(pick(item, ['subtitle', 'original_title', 'alias', 'episode_title'])),
      year: normalizeString(pick(item, ['year', 'release_year', 'date'])),
      type: normalizeString(pick(item, ['type', 'category', 'genre'])),
      region: normalizeString(pick(item, ['region', 'country', 'area'])),
      rating: normalizeString(pick(item, ['rating', 'score', 'douban_rating'])),
      poster: normalizeString(pick(item, ['poster', 'cover', 'thumbnail', 'image'])),
      url: url,
      summary: normalizeString(pick(item, ['summary', 'description', 'intro', 'overview'])),
      raw: item
    };
  }

  function readResources(root, movie, settings) {
    var resources = [];
    var seen = {};
    appendResourceValues(resources, seen, '在线资源', unwrapData(root), movie);
    if (movie && movie.raw && typeof movie.raw === 'object') appendResourceValues(resources, seen, '影片资源', movie.raw, movie);
    if (settings && settings.directOnly) return resources.filter(isPlayable);
    if (settings && settings.includeExternal === false) return resources.filter(isPlayable);
    return resources;
  }

  function appendResourceValues(resources, seen, group, value, movie) {
    var i;
    var key;
    var url;
    var nested;
    if (value === undefined || value === null) return;
    if (typeof value === 'string') {
      appendResource(resources, seen, group, value, movie, group);
      return;
    }
    if (Array.isArray(value)) {
      for (i = 0; i < value.length; i += 1) {
        if (typeof value[i] === 'string') {
          appendResource(resources, seen, group, value[i], movie, group + ' ' + (i + 1));
          continue;
        }
        if (!value[i] || typeof value[i] !== 'object') continue;
        url = resourceUrl(value[i]);
        if (url) appendResource(resources, seen, group, value[i], movie, resourceTitle(value[i], group + ' ' + (i + 1)));
        nested = false;
        for (key in value[i]) {
          if (Object.prototype.hasOwnProperty.call(value[i], key) && RESOURCE_ARRAY_KEYS.indexOf(key) >= 0 && value[i][key] !== url) {
            nested = true;
            appendResourceValues(resources, seen, resourceTitle(value[i], readableName(key)), value[i][key], movie);
          }
        }
        if (!url && !nested) {
          for (key in value[i]) {
            if (Object.prototype.hasOwnProperty.call(value[i], key)) appendResourceValues(resources, seen, readableName(key), value[i][key], movie);
          }
        }
      }
      return;
    }
    if (typeof value === 'object') {
      url = resourceUrl(value);
      if (url) appendResource(resources, seen, group, value, movie, resourceTitle(value, group));
      for (key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key) && RESOURCE_ARRAY_KEYS.indexOf(key) >= 0 && value[key] !== url) {
          appendResourceValues(resources, seen, readableName(key), value[key], movie);
        }
      }
    }
  }

  function appendResource(resources, seen, group, item, movie, fallbackTitle) {
    var url = resourceUrl(item);
    var title;
    var kind;
    var key;
    if (!url) return;
    title = typeof item === 'object' ? resourceTitle(item, fallbackTitle) : fallbackTitle || group || 'Resource';
    kind = classifyUrl(url);
    key = group + '|' + title + '|' + url;
    if (seen[key]) return;
    seen[key] = true;
    resources.push({
      id: String(resources.length + 1),
      group: normalizeString(group, 'Resource'),
      title: normalizeString(title, 'Resource'),
      movieTitle: movie && movie.title ? movie.title : '',
      url: url,
      kind: kind,
      playable: kind === 'playable',
      mimeType: mimeTypeForUrl(url),
      raw: item
    });
  }

  function resourceUrl(item) {
    var keys;
    var i;
    var value;
    if (typeof item === 'string') return normalizeString(item);
    if (!item || typeof item !== 'object') return '';
    keys = ['url', 'link', 'href', 'src', 'play_url', 'playUrl', 'play', 'm3u8', 'mp4', 'download_url', 'downloadUrl', 'source_url', 'sourceUrl', 'resource_url', 'resourceUrl', 'stream_url', 'streamUrl', 'video_url', 'videoUrl', 'file_url', 'fileUrl', 'source', 'resource', 'stream', 'video', 'file'];
    for (i = 0; i < keys.length; i += 1) {
      value = item[keys[i]];
      if (typeof value === 'string' || typeof value === 'number') return normalizeString(value);
    }
    return '';
  }

  function resourceTitle(item, fallback) {
    if (!item || typeof item !== 'object') return fallback || 'Resource';
    return normalizeString(pick(item, ['title', 'name', 'label', 'episode', 'episode_title', 'quality', 'format', 'source']), fallback || 'Resource');
  }

  function classifyUrl(url) {
    var lower = normalizeString(url).toLowerCase();
    if (!lower) return 'unknown';
    if (lower.indexOf('magnet:?') === 0) return 'magnet';
    if (lower.indexOf('ed2k://') === 0) return 'ed2k';
    if (/\.torrent($|[?#])/.test(lower)) return 'torrent';
    if (/^(rtmp|rtsp):\/\//.test(lower)) return 'playable';
    if (/^https?:\/\//.test(lower)) {
      if (PLAYABLE_SUFFIXES.some(function (suffix) { return lower.indexOf(suffix) >= 0; })) return 'playable';
      if (/(m3u8|dash|mpd|video|stream|playurl|media)/.test(lower)) return 'playable';
      return 'link';
    }
    return 'unknown';
  }

  function mimeTypeForUrl(url) {
    var lower = normalizeString(url).toLowerCase().split('?')[0];
    if (lower.indexOf('.m3u8') >= 0) return 'application/vnd.apple.mpegurl';
    if (lower.indexOf('.mpd') >= 0) return 'application/dash+xml';
    if (/\.mkv$/.test(lower)) return 'video/x-matroska';
    if (/\.webm$/.test(lower)) return 'video/webm';
    if (/\.avi$/.test(lower)) return 'video/x-msvideo';
    if (/\.mov$/.test(lower)) return 'video/quicktime';
    if (/\.mp3$/.test(lower)) return 'audio/mpeg';
    if (/\.flac$/.test(lower)) return 'audio/flac';
    if (/\.aac$/.test(lower)) return 'audio/aac';
    return 'video/mp4';
  }

  function publicMovie(movie) {
    var copy = {};
    if (!movie) return null;
    Object.keys(movie).forEach(function (key) {
      if (key !== 'raw') copy[key] = movie[key];
    });
    return copy;
  }

  function publicResource(resource) {
    var copy = {};
    Object.keys(resource || {}).forEach(function (key) {
      if (key !== 'raw') copy[key] = resource[key];
    });
    return copy;
  }

  function isPlayable(resource) {
    return resource && resource.playable;
  }

  function pick(object, keys, fallback) {
    var i;
    var value;
    if (!object || typeof object !== 'object') return fallback || '';
    for (i = 0; i < keys.length; i += 1) {
      value = object[keys[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback || '';
  }

  function normalizeString(value, fallback) {
    var text;
    if (value === undefined || value === null) return fallback || '';
    text = String(value).replace(/^\s+|\s+$/g, '');
    return text || fallback || '';
  }

  function readableName(key) {
    return normalizeString(key, 'Resource').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function slugFromUrl(url) {
    var text = normalizeString(url);
    var clean;
    var part;
    if (!text) return '';
    clean = text.split('#')[0].split('?')[0].replace(/\/+$/g, '');
    part = clean.split('/').pop() || '';
    try {
      return decodeURIComponent(part);
    } catch (error) {
      return part;
    }
  }

  function trimSlash(value) {
    return String(value || '').replace(/\/+$/g, '');
  }

  function allowed(value, list, fallback) {
    return list.indexOf(value) >= 0 ? value : fallback;
  }

  function clampInt(value, min, max, fallback) {
    var number = parseInt(value, 10);
    if (!isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  global.DDYSClient = {
    VERSION: VERSION,
    create: createClient,
    normalizeSettings: normalizeSettings,
    buildUrl: buildUrl,
    classifyUrl: classifyUrl,
    readMovies: readMovies,
    readResources: readResources,
    helpers: {
      normalizeMovie: normalizeMovie,
      mimeTypeForUrl: mimeTypeForUrl,
      unwrapData: unwrapData
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
