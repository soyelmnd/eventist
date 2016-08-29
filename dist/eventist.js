(function(root, factory) {
  function getInstanceName(instance) {
    return 'Eventist'; // TODO troubles with minification, fixed for now
    return instance.toString().match(/^function\s*([^(]+)/)[1];
  }

  if ('function' === typeof define && define.amd) {
    define([], factory);
  } else if ('undefined' !== typeof exports) {
    var instance = factory();

    if ('undefined' !== typeof module && module.exports) {
      exports = module.exports = instance;
    }

    exports[getInstanceName(instance)] = instance;
  } else {
    var instance = factory();
    root[getInstanceName(instance)] = instance;
  }
}('undefined' === typeof window ? this : window, function() {
  "use strict";

  /**
   * @param {string} string
   * @param {int} times
   * @return {String} repeatedString
   */
  function repeat(str, times) {
    var output = '';

    for (var i=0; i<times; ++i) {
      output += str;
    }

    return output;
  }

  /**
   * @name Eventist
   * @class
   * @description
   * Inspired by https://docs.angularjs.org/api/ng/type/$rootScope.Scope
   *
   * An eventist can `emit` (aka `trigger` in jQuery DOM) event, listen to
   * event with `on` (much like `on` in jQuery DOM) or even `broadcast` event
   *
   * With `emit`, event flows as in the bubbling phase of browser DOM, start
   * dispatching from the target, then target's parent, then target's
   * parent's parent ...
   *
   * With `broadcast`, event flows as in the capturing phase browser DOM,
   * start dispatching from the target, then target's children, then target's
   * children's children ...
   *
   * But how can an eventist know who's its parent, in order to propagate
   * event? Good question! A parent must be set explicitly. Well, instead of
   * calling it parent, let's use the word subscriber
   *
   * Oh, and we also have event.stopPropagation() and event.preventDefault(),
   * as a real normal DOM event, to be implemented ..
   */
  function Eventist() {}

  /**
   * @name Eventist.verbose
   * @type int
   * @description
   * Bit-permission like to customize the verbose level. In summary we have
   * 3 groups (x, y, z), corresponding to 3 sections to log (dispatchEvent,
   * subscribe/unsubscribe and on/off). Take a close look.
   *
   * x x x x  y y y y  z z z z
   *
   * Each group consist of 4 bit
   * 1: enable (with signature - log level 0)
   * 2: log level 1
   * 4: log level 2
   * 8: print stack trace
   */
  Eventist.verbose = 0;

  /**
   * @name Eventist#subscribe
   * @method
   * @param {Eventist} parent
   * @return {Eventist} this
   */
  Eventist.prototype.subscribe = function(parent) {
    if (!this.id) {
      console.error('Subscribe failed.', this);
      throw new Error('An eventist need an id to be able to subscribe');
    }

    if (!(parent instanceof Eventist)) {
      throw new Error('An eventist could only subscribe to another eventist');
    }

    // Logging
    var verbose = this._eventistVerbose | Eventist.verbose;
    if (verbose & 16) {
      var sign = '☊ ' + Util.getConstructorName(parent)
        + ' ← ' + Util.getConstructorName(this);

      if (verbose & 32) {
        console.groupCollapsed(sign);
        console.log('event: ', evt);
        console.log('constructor: ', this.constructor);
        console.log('parent:', parent)
        console.groupEnd();
      } else {
        console.log(sign);
      }

      if (verbose & 128) {
        console.trace();
      }
    }

    // Initialize the _eventistChildren list, if needed
    parent._eventistChildren = parent._eventistChildren || {};
    parent._eventistChildren[this.id] = this;

    this._eventistParent = parent;

    return this;
  };

  /**
   * @name Eventist#unsubscribe
   * @method
   * @param {Eventist} [parent]
   * @return {Eventist} this
   */
  Eventist.prototype.unsubscribe = function(parent) {
    if (!this._eventistParent) {
      throw new Error('But .. this eventist has no parent')
    }
    if (parent && parent !== this._eventistParent) {
      throw new Error('Could not unsubscribe from a parent of someone else, lol');
    }

    // Support no param
    //   to unsubscribe from current parent
    parent = parent || this._eventistParent;

    if (!parent._eventistChildren || !parent._eventistChildren[this.id]) {
      throw new Error('Could not find this eventist in the parent children list');
    }

    // Logging
    var verbose = this._eventistVerbose | Eventist.verbose;
    if (verbose & 16) {
      var sign = '☋  ' + Util.getConstructorName(parent)
        + ' ↚ ' + Util.getConstructorName(this);

      console.log(sign);

      if (verbose & 128) {
        console.trace();
      }
    }

    delete parent._eventistChildren[this.id];
    this._eventistParent = null;

    return this;
  }

  /**
   * @name Eventist#on
   * @method
   * @param {string} events
   * @param {function} callback
   * @param {string} [flag]
   * @return {Eventist} this
   */
  Eventist.prototype.on = function(events, callback, flag) {
    var listeners = this._eventListeners = this._eventListeners || {};

    // let's support multi event binding at a time
    //   separated by common delimiters, just like
    //   the other js famous frameworks/libraries
    events.split(/ |,|;|\|/).forEach(function(evt) {
      listeners[evt] = listeners[evt] || [];

      flag = flag || 'append';

      if ('append' === flag) {
        listeners[evt].push(callback);
      } else if ('prepend' === flag) {
        listeners[evt].unshift(callback);
      } else if ('set' === flag) {
        listeners[evt] = [callback];
      }
    });

    this._eventistUnbindMostRecentBinding = function() {
      this.off(events, callback);
    }.bind(this);

    return this;
  };

  /**
   * @name Eventist#off
   * @method
   * @param {string} events
   * @param {function} callback
   * @return {Eventist} this
   */
  Eventist.prototype.off = function(events, callback) {
    var listeners = this._eventListeners = this._eventListeners || {};

    // same to on, we should support multiple remove at a time
    events.split(/ |,|;|\|/).forEach(function(evt) {
      var idx = -1;

      if (listeners[evt] && listeners[evt].length) {
        idx = listeners[evt].indexOf(callback);
      }

      if (0 <= idx) {
        listeners[evt].splice(idx, 1);
        console.log(events, callback.toString());
      }
    });

    return this;
  };

  /**
   * @name Eventist#dispatchEvent
   * @method
   * @param {string} event
   * @param {Object} [args]
   * @param {Object} [origin]
   * @return {Eventist} this
   * @description
   * Dispatch event without any bubbling
   */
  Eventist.prototype.dispatchEvent = function(evt, args, origin) {
    var verbose = this._eventistVerbose | Eventist.verbose;

    if (verbose & 1) {
      var target = Util.getConstructorName(this)
        , isEmitter = (origin && origin.deep) ? ' ' : '★'
        , propagation = origin ? ('emit' === origin.eventType ? '↑' : '↓') : '-'
        , deep = origin ? origin.deep : 0;

      var sign = isEmitter
        + propagation
        + repeat('.', deep)
        + ' ' + target + '#' + evt;

      if (verbose & 2) {
        console.groupCollapsed(sign);
        console.log('event: ', evt);
        console.log('constructor: ', this.constructor);
        console.log('args: ', args);
        console.log('origin: ', origin);
        console.groupEnd();
      } else {
        console.log(sign);
      }

      if (verbose & 8) {
        console.trace();
      }
    }

    if (this._eventListeners) {
      var callbacks = this._eventListeners[evt];

      if (callbacks && callbacks.length) {
        for (var idx in callbacks) {
          callbacks[idx].call(this, origin || {}, args);
        }
      }
    }

    return this;
  }

  /**
   * @name Eventist#emit
   * @method
   * @param {string} event
   * @param {Object} [args]
   * @return {Eventist} this
   */
  Eventist.prototype.emit = function(evt, args, origin) {
    // The origin should be private and not to be exposed to user
    //   since it's totally internal for event origin tracking purpose
    //   The idea is, origin won't be passed in any call
    //   and the first trigger in a chain will propose a new origin
    origin = origin || {
      eventType: 'emit',
      target: this,
      hop: []
    };

    origin.hop.push(this); // yep, we're now one hop in the event path

    // Only turn on deep logging
    //   when enable dispatchEvent log level 0
    var verbose = this._eventistVerbose | Eventist.verbose;
    if (verbose & 1) {
      origin = {
        eventType: origin.eventType,
        target: origin.target,
        deep: 'undefined' !== typeof origin.deep ? (origin.deep + 1) : 0
      }
    }

    this.dispatchEvent(evt, args, origin);

    // Bubbling bubbling
    this._eventistParent
    && this._eventistParent.emit(evt, args, origin);

    return this;
  };

  /**
   * @name Eventist#trigger
   * @method
   * @alias Eventist#emit
   */
  Eventist.prototype.trigger = Eventist.prototype.emit;

  /**
   * @name Eventist#broadcast
   * @method
   * @param {string} event
   * @param {Object} [args]
   * @return {Eventist} this
   * @description
   * WARNING
   * Use broadcast at your own risk, since 2-way events is not recommended
   * and may easily cause infinite loops because of unclear process flow.
   */
  Eventist.prototype.broadcast = function(evt, args, origin) {
    // Regarding the origin, @see above
    origin = origin || {
      eventType: 'broadcast',
      target: this,
      hop: []
    };

    origin.hop.push(this);

    // Only turn on deep logging
    //   when enable dispatchEvent log level 0
    var verbose = this._eventistVerbose | Eventist.verbose;
    if (verbose & 1) {
      origin = {
        eventType: origin.eventType,
        target: origin.target,
        deep: 'undefined' !== typeof origin.deep ? (origin.deep + 1) : 0
      }
    }

    this.dispatchEvent(evt, args, origin);

    if (this._eventistChildren) {
      for (var key in this._eventistChildren) {
        // Inverse bubbling bubbling
        this._eventistChildren[key].broadcast(evt, args, origin);
      }
    }

    return this;
  };

  return Eventist;
}));
