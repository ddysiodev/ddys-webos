(function (global) {
  'use strict';

  function createStore(namespace) {
    var memory = {};

    function key(name) {
      return namespace + ':' + name;
    }

    function read(name, fallback) {
      var raw = null;
      try {
        raw = global.localStorage ? global.localStorage.getItem(key(name)) : memory[key(name)];
      } catch (error) {
        raw = memory[key(name)];
      }
      if (!raw) return clone(fallback);
      try {
        return JSON.parse(raw);
      } catch (error) {
        return clone(fallback);
      }
    }

    function write(name, value) {
      var raw = JSON.stringify(value);
      try {
        if (global.localStorage) global.localStorage.setItem(key(name), raw);
        else memory[key(name)] = raw;
      } catch (error) {
        memory[key(name)] = raw;
      }
      return value;
    }

    function remove(name) {
      try {
        if (global.localStorage) global.localStorage.removeItem(key(name));
      } catch (error) {}
      delete memory[key(name)];
    }

    return { read: read, write: write, remove: remove };
  }

  function clone(value) {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  global.DDYSStore = { create: createStore };
})(typeof window !== 'undefined' ? window : globalThis);
