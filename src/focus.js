(function (global) {
  'use strict';

  function createFocusManager(options) {
    var selector = options && options.selector ? options.selector : '[data-focusable]';
    var focusedClass = options && options.focusedClass ? options.focusedClass : 'is-focused';
    var nodes = [];
    var index = -1;

    function refresh(preferred) {
      nodes = Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (node) {
        return !node.disabled && node.offsetParent !== null && node.getAttribute('aria-hidden') !== 'true';
      });
      nodes.forEach(function (node, nodeIndex) {
        node.setAttribute('tabindex', '-1');
        if (!node.__ddysFocusBound) {
          node.__ddysFocusBound = true;
          node.addEventListener('focus', function () { setCurrent(nodes.indexOf(node), false); });
          node.addEventListener('mouseenter', function () { setCurrent(nodes.indexOf(node), false); });
          node.addEventListener('pointerover', function () { setCurrent(nodes.indexOf(node), false); });
        }
        if (node === preferred) index = nodeIndex;
      });
      if (!nodes.length) {
        index = -1;
        return;
      }
      if (preferred && nodes.indexOf(preferred) >= 0) {
        setCurrent(nodes.indexOf(preferred), true);
        return;
      }
      if (index < 0 || index >= nodes.length) setCurrent(0, true);
      else setCurrent(index, true);
    }

    function current() {
      return nodes[index] || null;
    }

    function setCurrent(nextIndex, shouldFocus) {
      if (nextIndex < 0 || nextIndex >= nodes.length) return;
      if (nodes[index]) nodes[index].classList.remove(focusedClass);
      index = nextIndex;
      nodes[index].classList.add(focusedClass);
      if (shouldFocus) {
        try { nodes[index].focus(); } catch (error) {}
        scrollIntoView(nodes[index]);
      }
    }

    function move(direction) {
      var from = current();
      var next;
      if (!from) {
        refresh();
        return;
      }
      next = findNearest(from, direction);
      if (next) setCurrent(nodes.indexOf(next), true);
    }

    function click() {
      var node = current();
      if (node && typeof node.click === 'function') node.click();
    }

    function findNearest(from, direction) {
      var fromRect = from.getBoundingClientRect();
      var fromCenter = centerOf(fromRect);
      var best = null;
      var bestScore = Infinity;
      nodes.forEach(function (node) {
        var rect;
        var center;
        var dx;
        var dy;
        var primary;
        var secondary;
        var score;
        if (node === from) return;
        rect = node.getBoundingClientRect();
        center = centerOf(rect);
        dx = center.x - fromCenter.x;
        dy = center.y - fromCenter.y;
        if (direction === 'left' && dx >= -4) return;
        if (direction === 'right' && dx <= 4) return;
        if (direction === 'up' && dy >= -4) return;
        if (direction === 'down' && dy <= 4) return;
        primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
        secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
        score = primary * 2 + secondary;
        if (score < bestScore) {
          bestScore = score;
          best = node;
        }
      });
      return best || wrap(direction);
    }

    function wrap(direction) {
      if (!nodes.length) return null;
      if (direction === 'left' || direction === 'up') return nodes[Math.max(0, index - 1)];
      return nodes[Math.min(nodes.length - 1, index + 1)];
    }

    return { refresh: refresh, move: move, click: click, current: current, setCurrent: setCurrent };
  }

  function centerOf(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function scrollIntoView(node) {
    if (!node || !node.scrollIntoView) return;
    try {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (error) {
      node.scrollIntoView(false);
    }
  }

  global.DDYSFocus = { create: createFocusManager };
})(typeof window !== 'undefined' ? window : globalThis);
