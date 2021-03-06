var L = require('leaflet')
require('./layout.css')
require('./range.css')
require('./swap.css')

var mapWasDragEnabled
var mapWasTapEnabled

// Leaflet v0.7 backwards compatibility
function on (el, types, fn, context) {
  types.split(' ').forEach(function (type) {
    L.DomEvent.on(el, type, fn, context)
  })
}

// Leaflet v0.7 backwards compatibility
function off (el, types, fn, context) {
  types.split(' ').forEach(function (type) {
    L.DomEvent.off(el, type, fn, context)
  })
}

function getRangeEvent (rangeInput) {
  return 'oninput' in rangeInput ? 'input' : 'change'
}

function cancelMapDrag () {
  mapWasDragEnabled = this._map.dragging.enabled()
  mapWasTapEnabled = this._map.tap && this._map.tap.enabled()
  this._map.dragging.disable()
  this._map.tap && this._map.tap.disable()
}

function uncancelMapDrag (e) {
  this._refocusOnMap(e)
  if (mapWasDragEnabled) {
    this._map.dragging.enable()
  }
  if (mapWasTapEnabled) {
    this._map.tap.enable()
  }
}

// convert arg to an array - returns empty array if arg is undefined
function asArray (arg) {
  return !arg ? [] : Array.isArray(arg) ? arg : [arg]
}

function noop () {}

L.Control.SideBySide = L.Control.extend({
  options: {
    thumbSize: 30,
    padding: 0,
    swap: false
  },

  swapped: false,

  initialize: function (leftLayers, rightLayers, options) {
    this.setLeftLayers(leftLayers)
    this.setRightLayers(rightLayers)
    L.setOptions(this, options)
  },

  getPosition: function () {
    var rangeValue = this._range.value
    var offset = (0.5 - rangeValue) * (2 * this.options.padding + this.options.thumbSize)
    return this._map.getSize().x * rangeValue + offset
  },

  setPosition: noop,

  includes: L.Evented.prototype || L.Mixin.Events,

  addTo: function (map) {
    this.remove()
    this._map = map

    var container = this._container = L.DomUtil.create('div', 'leaflet-sbs', map._controlContainer)

    this._divider = L.DomUtil.create('div', 'leaflet-sbs-divider', container)
    var range = this._range = L.DomUtil.create('input', 'leaflet-sbs-range', container)
    range.addEventListener('click', function (e) { e.stopPropagation() })
    range.type = 'range'
    range.min = 0
    range.max = 1
    range.step = 'any'
    range.value = 0.5
    range.style.paddingLeft = range.style.paddingRight = this.options.padding + 'px'

    if (this.options.swap) {
      var swap = (this._swap = L.DomUtil.create('button', 'leaflet-sbs-swap', container))
      swap.type = 'button'
      swap.setAttribute('aria-label', 'Swap images')
      swap.setAttribute('data-left', this.swapped ? 'B' : 'A')
      swap.setAttribute('data-right', this.swapped ? 'A' : 'B')
      swap.style.display = 'none'
      swap.style.paddingLeft = swap.style.paddingRight = this.options.padding + 'px'
      swap.style.top = 'calc(50% + ' + this.options.thumbSize + 'px)'
    }

    this._addEvents()
    this._updateLayers()
    return this
  },

  getWrapper: function (layer) {
    return layer.getContainer ? layer.getContainer() : layer.getPane()
  },

  remove: function () {
    if (!this._map) {
      return this
    }
    if (this._leftLayers) {
      this._leftLayers.forEach(this._updateLayerClip.bind(this, ''))
    }
    if (this._rightLayers) {
      this._rightLayers.forEach(this._updateLayerClip.bind(this, ''))
    }
    this._removeEvents()
    L.DomUtil.remove(this._container)

    this._map = null

    return this
  },

  setLeftLayers: function (leftLayers) {
    this._leftLayers = asArray(leftLayers)
    this._updateLayers()
    return this
  },

  setRightLayers: function (rightLayers) {
    this._rightLayers = asArray(rightLayers)
    this._updateLayers()
    return this
  },
  // Adds an layer to the left side note it is your responsibility to add the layer to the map still
  addLeftLayer: function (layer) {
    layer = asArray(layer)
    this._leftLayers = [...this._leftLayers, ...layer]
    this._updateLayers()
  },
  addRightLayer: function (layer) {
    layer = asArray(layer)
    this._rightLayers = [...this._rightLayers, ...layer]
    this._updateLayers()
  },

  _updateLayerClip: function (clip, layer) {
    if (!this._map.hasLayer(layer)) {
      console.warn('Layer Not On Map Cant Clip')
    } else if (typeof layer.getContainer === 'function') {
      // tilelayer
      let container = layer.getContainer()
      if (container !== null && container !== undefined) {
        container.style.clip = clip
      }
      // eslint-disable-next-line brace-style
    }
    /* else if (typeof (layer.getLayers) === 'function') {
      // svg path (geojson)??
    } */
    else if (typeof layer.getPane === 'function') {
      try {
        let pane = layer.getPane()
        pane.style.clip = clip
      } catch (error) {
        // this shouldn't error
        console.error(error)// do not like the idea of silent errors
      }
    } else {
      if (layer.map == null) {
        console.warn('Layer May be removed from map cant update clip')
      } else {
        console.error('Unsupported Layer Type: ', layer)
      }
    }
  },

  _updateClip: function () {
    var map = this._map
    var nw = map.containerPointToLayerPoint([0, 0])
    var se = map.containerPointToLayerPoint(map.getSize())
    var clipX = nw.x + this.getPosition()
    var dividerX = this.getPosition()

    this._divider.style.left = dividerX + 'px'
    this.fire('dividermove', { x: dividerX })

    if (this._swap) {
      this._swap.style.display = this._leftLayer && this._rightLayer ? 'block' : 'none'
      this._swap.style.left = dividerX - this.options.thumbSize / 2 + 'px'
      this._swap.setAttribute('data-left', this.swapped ? 'B' : 'A')
      this._swap.setAttribute('data-right', this.swapped ? 'A' : 'B')
    }

    var clipLeft = 'rect(' + [nw.y, clipX, se.y, nw.x].join('px,') + 'px)'
    var clipRight = 'rect(' + [nw.y, se.x, se.y, clipX].join('px,') + 'px)'

    this._leftLayers.forEach(this._updateLayerClip.bind(this, clipLeft))
    this._rightLayers.forEach(this._updateLayerClip.bind(this, clipRight))
  },

  _updateLayers: function () {
    if (!this._map) {
      return this
    }
    var prevLeft = this._leftLayer
    var prevRight = this._rightLayer
    this._leftLayer = this._rightLayer = null
    this._leftLayers.forEach(function (layer) {
      if (this._map.hasLayer(layer)) {
        this._leftLayer = layer
      }
    }, this)
    this._rightLayers.forEach(function (layer) {
      if (this._map.hasLayer(layer)) {
        this._rightLayer = layer
      }
    }, this)
    if (prevLeft !== this._leftLayer) {
      prevLeft && this.fire('leftlayerremove', { layer: prevLeft })
      this._leftLayer && this.fire('leftlayeradd', { layer: this._leftLayer })
    }
    if (prevRight !== this._rightLayer) {
      prevRight && this.fire('rightlayerremove', { layer: prevRight })
      this._rightLayer && this.fire('rightlayeradd', { layer: this._rightLayer })
    }
    this._updateClip()
  },

  _swapLayers: function () {
    var prevLefts = this._leftLayers
    var prevRights = this._rightLayers
    this._leftLayers = prevRights
    this._rightLayers = prevLefts

    var prevLeft = this._leftLayer
    var prevRight = this._rightLayer
    this._leftLayer = prevRight
    this._rightLayer = prevLeft

    this.swapped = !this.swapped
    this._updateLayers()
    this.fire('swapped', { swapped: this.swapped })
  },

  _addEvents: function () {
    var range = this._range
    var map = this._map
    var swap = this._swap
    if (map) {
      map.on('move', this._updateClip, this)
    }
    if (range) {
      on(range, getRangeEvent(range), this._updateClip, this)
      on(range, L.Browser.touch ? 'touchstart' : 'mousedown', cancelMapDrag, this)
      on(range, L.Browser.touch ? 'touchend' : 'mouseup', uncancelMapDrag, this)
    }
    if (this._leftLayers) {
      this._leftLayers.forEach(l => {
        l.on('layeradd layerremove', this._updateLayers, this)
      })
    }
    if (this._rightLayers) {
      this._rightLayers.forEach(l => {
        l.on('layeradd layerremove', this._updateLayers, this)
      })
    }
    if (swap) {
      on(swap, 'click', this._swapLayers, this)
    }
  },

  _removeEvents: function () {
    var range = this._range
    var map = this._map
    var swap = this._swap
    if (map) {
      map.off('move', this._updateClip, this)
    }
    if (range) {
      off(range, getRangeEvent(range), this._updateClip, this)
      off(range, L.Browser.touch ? 'touchstart' : 'mousedown', cancelMapDrag, this)
      off(range, L.Browser.touch ? 'touchend' : 'mouseup', uncancelMapDrag, this)
    }
    if (this._leftLayers) {
      this._leftLayers.forEach(l => {
        l.off('layeradd layerremove', this._updateLayers, this)
      })
    }
    if (this._rightLayers) {
      this._rightLayers.forEach(l => {
        l.off('layeradd layerremove', this._updateLayers, this)
      })
    }
    if (swap) {
      off(swap, 'click', this._swapLayers, this)
    }
  }
})

L.control.sideBySide = function (leftLayers, rightLayers, options) {
  return new L.Control.SideBySide(leftLayers, rightLayers, options)
}

module.exports = L.Control.SideBySide
