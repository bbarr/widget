
var _ = require('lodash')
var Backbone = require('backbone')
var rivets = require('rivets')
var $ = require('jquery')
var toast = require('toast')

// this is the event hub that all modules will have access to
var hub = _.extend({}, Backbone.Events)

// here are some utilities
function argsAsArray(args) {
  return _.flatten(_.toArray(args))
}

function notAlreadyLoaded(url) {
  return !_.any($('script, link').toArray(), function(el) { 
    return el.getAttribute('src') == url || el.getAttribute('href') == url
  })
}

function fluent(fn) {
  return function() {
    fn.apply(this, arguments)
    return this
  }
}

// Properly handle scripts trying to be loaded by document.write()
if (document && document.write) {
  var docWrite = document.write
  document.write = function(content) {
    if (content.indexOf('script') == 1) {
      Widget.prototype.assets(['//' + content.split('://')[1].split('.js')[0] + '.js'])
    } else {
      console.log('SOMEONE tried to document.write something that wasnt a script... wtf?')
    }
  }
}

// add widget binder to rivets.js
rivets.binders.widget = {

  'function': true,

  bind: function(el) {
    if (this.marker) return

    this.marker = document.createComment('rivets: widget')
   
    var attr = [ this.view.config.prefix, this.type ].join('-').replace('--', '-')
    el.removeAttribute(attr)

    el.parentNode.insertBefore(this.marker, el)

    el.setAttribute('rv-show', 'widget:visible')
    el.setAttribute('rv-class-loading', 'widget:loading')
    el.setAttribute('rv-class-disabled', 'widget:disabled')
  },

  unbind: function(el) {
    el.parentNode.removeChild(el)
    if (this.widget.view) this.widget.view.unbind()
    this.widget.uninstall()
  },

  routine: function(el) {

    var run = function(el, widgetObj) {
      var widget = widgetObj.factory()
      if (this.widget) return

      var bind = function() {
        widget.ensureFragment(function(frag) {
          el.innerHTML = ''
          el.appendChild(frag.cloneNode(true))

          var models = _.extend({}, this.view.models, { widget: widget })
          var options = {
            binders: this.view.binders,
            formatters: this.view.formatters,
            adapters: this.view.adapters,
            config: this.view.config
          }

          widget.view = rivets.bind(el, models, options)
          this.marker.parentNode.insertBefore(el, this.marker.nextSibling)
        }.bind(this))
      }.bind(this)

      widget.on('change:running', function() {
        if (!widget.get('running')) return this.unbind(el)
        bind()
      }, this)

      if (widget.get('running')) bind()

      this.widget = widget
      widget.install(el)
    }.bind(this)

    var name = el.getAttribute('data-widget-name')
    if (!name) return
    hub.trigger('widget:needed', name, run.bind(this, el))
  }
}

// actual widget model
var Widget = Backbone.Model.extend({

  _createFragment: function() {
    var child
    var frag = document.createDocumentFragment()
    var tmp = document.createElement('body')
    tmp.innerHTML = this.get('html')
    while (child = tmp.firstChild) frag.appendChild(child)
    this.set('fragment', frag)
  },

  ensureFragment: function(cb) {
    var frag = this.get('fragment')
    if (frag) return cb(frag)
    this.once('change:fragment', function() {
      cb(this.get('fragment'))
    }, this)
  },

  constructor: function() {
    this.styleTags = []
    this.on('change:html', this._createFragment, this)
    Backbone.Model.prototype.constructor.apply(this, arguments)
  },
 
  install: function(el) {
    this.set('el', el)
    // try to get bootstrapped HTML
    if (el.children.length) this.set('html', el.innerHTML)
    this.trigger('installed')
  },

  uninstall: function() {
    function remove(el) { el.parentNode.removeChild(el) }
    this.styleTags.forEach(remove)
    this.unset('el')
    this.trigger('uninstalled')
  },

  template: fluent(function(url) {
    $.ajax({
      type: 'GET',
      accept: 'text/html',
      url: url,
      success: this.set.bind(this, 'html')
    })
  }),

  assets: fluent(function(arr, cb) {
    toast.apply(null, arr.concat(cb))
  }),

  start: fluent(function() {
    this.set('running', true)
    this.show()
  }),

  stop: fluent(function() {
    this.set('running', false)
    this.hide()
  }),

  enable: fluent(function() {
    this.set('disabled', false)
  }),

  disable: fluent(function() {
    this.set('disabled', true)
  }),

  show: fluent(function() {
    this.set('visible', true)
  }),

  hide: fluent(function() {
    this.set('visible', false)
  }),

  loading: fluent(function() {
    this.set('loading', true)
  }),

  loaded: fluent(function() {
    this.set('loading', false)
  })
})

// factory + API
module.exports = function(name, fn) {

  var anon = !fn

  if (anon) fn = name

  var SubWidget = Widget.extend({ 
    initialize: function() {
      fn.call(this, hub)
    }
  })

  var factory = function() { return new SubWidget() }

  if (!anon) {
    hub.trigger('widget:defined', { name: name, factory: factory })
  }

  return factory
}

// store widgets
var registery = {}
hub.on('widget:defined', function(obj) { registery[obj.name] = obj })
hub.on('widget:needed', function(name, cb) { cb(registery[name]) })

module.exports.Widget = Widget
module.exports.hub = hub

