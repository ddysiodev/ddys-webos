(function (global) {
  'use strict';

  function createPlayer(options) {
    var screen = document.getElementById('playerScreen');
    var video = document.getElementById('videoPlayer');
    var title = document.getElementById('playerTitle');
    var source = document.getElementById('playerSource');
    var status = document.getElementById('playerStatus');
    var onStop = options && options.onStop ? options.onStop : function () {};
    var onProgress = options && options.onProgress ? options.onProgress : function () {};
    var current = null;
    var progressTimer = null;

    video.addEventListener('waiting', function () { setStatus('缓冲中'); });
    video.addEventListener('playing', function () { setStatus('播放中'); });
    video.addEventListener('pause', function () { if (current) setStatus('已暂停'); });
    video.addEventListener('ended', function () { stop(); });
    video.addEventListener('error', function () {
      var error = video.error;
      setStatus('播放错误：' + (error ? error.code : 'unknown'));
    });

    function open(resource, movie, resumeSeconds) {
      current = { resource: resource, movie: movie, startedAt: Date.now(), position: resumeSeconds || 0 };
      title.textContent = movie && movie.title ? movie.title : resource.title || 'DDYS';
      source.textContent = resource.title || resource.group || '播放资源';
      status.textContent = '正在打开播放器';
      screen.hidden = false;
      screen.classList.add('is-active');
      video.hidden = false;
      video.src = resource.url;
      video.controls = false;
      video.preload = 'auto';
      video.load();
      video.addEventListener('loadedmetadata', seekAfterMetadata, { once: true });
      video.play().then(function () {
        setStatus(resumeSeconds ? '已从上次位置继续播放' : '播放中');
      }).catch(function (error) {
        setStatus('播放失败：' + (error && error.message ? error.message : error));
      });
      startProgressTimer();
    }

    function seekAfterMetadata() {
      if (!current || !current.position || !video.duration) return;
      try {
        video.currentTime = Math.max(0, Math.min(video.duration - 2, current.position));
      } catch (error) {}
    }

    function toggle() {
      if (!current) return;
      if (video.paused) video.play();
      else video.pause();
      setStatus(video.paused ? '已暂停' : '播放中');
    }

    function seek(deltaSeconds) {
      if (!current || !video.duration) return;
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + deltaSeconds));
      setStatus(deltaSeconds > 0 ? '快进' : '快退');
      pushProgress();
    }

    function stop() {
      var stopped = current;
      if (stopped) {
        stopped.position = safePosition();
        stopped.duration = safeDuration();
        onStop(stopped);
      }
      stopProgressTimer();
      video.pause();
      video.removeAttribute('src');
      video.hidden = true;
      try { video.load(); } catch (error) {}
      current = null;
      screen.classList.remove('is-active');
      screen.hidden = true;
    }

    function startProgressTimer() {
      stopProgressTimer();
      progressTimer = setInterval(pushProgress, 5000);
    }

    function stopProgressTimer() {
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = null;
    }

    function pushProgress() {
      if (!current) return;
      current.position = safePosition();
      current.duration = safeDuration();
      onProgress(current);
    }

    function safePosition() {
      return Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : 0;
    }

    function safeDuration() {
      return Number.isFinite(video.duration) ? Math.floor(video.duration) : 0;
    }

    function setStatus(text) {
      status.textContent = text;
    }

    function selfCheck() {
      return {
        webos: !!(global.webOS || global.PalmSystem),
        video: !!video && typeof video.play === 'function',
        hlsLikely: !!(video && typeof video.canPlayType === 'function' && video.canPlayType('application/vnd.apple.mpegurl') !== ''),
        mp4: !!(video && typeof video.canPlayType === 'function' && video.canPlayType('video/mp4') !== ''),
        current: !!current
      };
    }

    return {
      open: open,
      toggle: toggle,
      seek: seek,
      stop: stop,
      selfCheck: selfCheck,
      isActive: function () { return !!current; }
    };
  }

  global.DDYSPlayer = { create: createPlayer };
})(typeof window !== 'undefined' ? window : globalThis);
