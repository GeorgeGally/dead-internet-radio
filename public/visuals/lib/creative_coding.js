var PI = Math.PI;
var TWO_PI = Math.PI * 2;

var p = CanvasRenderingContext2D.prototype;

p.background = function (r, g, b, a) {
  var c = this.fillStyle;
  this.fillStyle = getColour(r, g, b, a);
  this.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.fillStyle = c;
};

p.fillMe = function(r, g, b, a){
  this.fillStyle = getColour(r, g, b, a);
};

p.strokeMe = function(r, g, b, a){
  this.strokeStyle = getColour(r, g, b, a);
};

p.strokeWeight = function(val){
  this.lineWidth = val;
};

function rgb(r, g, b, a) { return getColour(r, g, b, a); }
function rgba(r, g, b, a) { return getColour(r, g, b, a); }
function hsl(h, s, l) { return 'hsl(' + h + ', ' + clamp(s, 0, 100) + '%, ' + clamp(l, 0, 100) + '%)'; }
function hsla(h, s, l, a) { return 'hsla(' + h + ', ' + clamp(s, 0, 100) + '%, ' + clamp(l, 0, 100) + '%, ' + clamp(a, 0, 1) + ')'; }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;
  if (max == min) { h = s = 0; }
  else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hexToRGBA(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  if (alpha) return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  return "rgb(" + r + ", " + g + ", " + b + ")";
}

function getColour(r, g, b, a) {
  if ((typeof r === 'string' || r instanceof String) && r.substr(0, 1) == "#") return r;
  else if (typeof r === 'string' || r instanceof String) return r;
  else if (g == undefined) return 'rgb(' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(r), 0, 255) + ')';
  else if (b == undefined) return 'rgba(' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(r), 0, 255) + ', ' + clamp(g, 0, 1) + ')';
  else if (a == undefined) return 'rgba(' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(g), 0, 255) + ', ' + clamp(Math.round(b), 0, 255) + ', 1)';
  return 'rgba(' + clamp(Math.round(r), 0, 255) + ', ' + clamp(Math.round(g), 0, 255) + ', ' + clamp(Math.round(b), 0, 255) + ', ' + clamp(a, 0, 1) + ')';
}

p.colour = function(r, g, b, a) { this.fillStyle = getColour(r, g, b, a); };
p.lineColour = function(r, g, b, a) { this.strokeStyle = getColour(r, g, b, a); };

p.noStroke = function(){ this.no_stroke = true; };

p.strokeColor = function(r, g, b, a) {
  this.strokeStyle = getColour(r, g, b, a);
  this.no_stroke = true;
};

p.makeCircle = function(x, y, radius) {
  this.beginPath();
  this.arc(x, y, radius / 2, 0, Math.PI * 2, true);
};

p.circle = p.fillCircle = function(x, y, radius) {
  this.makeCircle(x, y, radius);
  this.fill();
  this.closePath();
};

p.strokeCircle = function(x, y, radius) {
  this.makeCircle(x, y, radius);
  this.stroke();
  this.closePath();
};

p.ellipse = function(x, y, width, height) {
  if (height == undefined) height = width;
  this.beginPath();
  for (var i = 0; i < Math.PI * 2; i += Math.PI / 16) {
    this.lineTo(x + (Math.cos(i) * width / 2), y + (Math.sin(i) * height / 2));
  }
  this.closePath();
};

p.Hellipse = function(x, y, width, height) {
  if (height == undefined) height = width;
  this.beginPath();
  for (var i = 0; i < Math.PI * 2; i += Math.PI / 64) this.lineTo(x + (Math.cos(i) * width / 2), y + (Math.sin(i) * height / 2));
};

p.Lellipse = function(x, y, width, height, sides) {
  var sides = sides || 8;
  if (height == undefined) height = width;
  this.beginPath();
  for (var i = 0; i < Math.PI * 2; i += Math.PI / sides) {
    this.lineTo(x + (Math.cos(i) * width / 2), y + (Math.sin(i) * height / 2));
  }
};

p.fillEllipse = function(x, y, width, height) {
  height = height || width;
  this.beginPath();
  for (var i = 0; i < Math.PI * 2; i += Math.PI / 16) {
    this.lineTo(x + (Math.cos(i) * width / 2), y + (Math.sin(i) * height / 2));
  }
  this.closePath();
  this.fill();
  this.beginPath();
};

p.HfillEllipse = function(x, y, width, height) {
  if (height == undefined) height = width;
  this.Hellipse(x, y, width, height);
  this.fill();
  this.beginPath();
};

p.LfillEllipse = function(x, y, w, h, sides) {
  var h = h || w;
  var sides = sides || 8;
  this.Lellipse(x, y, w, h, sides);
  this.fill();
  this.beginPath();
};

p.strokeEllipse = function(x, y, width, height) {
  height = height || width;
  this.beginPath();
  for (var i = 0; i < Math.PI * 2; i += Math.PI / 16) {
    this.lineTo(x + (Math.cos(i) * width / 2), y + (Math.sin(i) * height / 2));
  }
  this.closePath();
  this.stroke();
  this.beginPath();
};

p.fillRectCentered = function(x, y, width, height) {
  height = height || width;
  this.fillRect(x - width / 2, y - height / 2, width, height);
};

p.line = function(x1, y1, x2, y2) {
  this.beginPath();
  this.moveTo(x1, y1);
  this.lineTo(x2, y2);
  this.stroke();
  this.closePath();
};

p.triangle = function(x1, y1, x2, y2, x3, y3) {
  this.beginPath();
  this.moveTo(x1, y1);
  this.lineTo(x2, y2);
  this.lineTo(x3, y3);
  this.lineTo(x1, y1);
  this.stroke();
  this.closePath();
};

p.fillTriangle = function(x1, y1, x2, y2, x3, y3) {
  this.beginPath();
  this.moveTo(x1, y1);
  this.lineTo(x2, y2);
  this.lineTo(x3, y3);
  this.lineTo(x1, y1);
  this.fill();
  this.closePath();
};

function radians(deg) { return deg * Math.PI / 180; }
function degrees(rad) { return (rad * 180 / Math.PI) % 360; }

function degreesToPoint(deg, diameter) {
  var rad = Math.PI * deg / 180;
  var r = diameter / 2;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

function dist(x1, y1, x2, y2) {
  x2 -= x1; y2 -= y1;
  return Math.sqrt(x2 * x2 + y2 * y2);
}

function map(value, min1, max1, min2, max2, clampResult) {
  var returnvalue = ((value - min1) / (max1 - min1) * (max2 - min2)) + min2;
  return clampResult ? clamp(returnvalue, min2, max2) : returnvalue;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
}

function tween(pos, target, speed) {
  if (speed == undefined) speed = 20;
  return pos + (target - pos) / speed;
}

function lerp(v0, v1, t) { return v0 * (1 - t) + v1 * t; }

function random(min, max) {
  if (min === undefined && max === undefined) { min = 0; max = 1; }
  else if (max === undefined) { max = min; min = 0; }
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  return Math.floor(Math.random() * (max + 1 - min)) + min;
}

function chance(val) { return Math.random() * val < 1; }

function posNeg() { return randomInt(0, 1) * 2 - 1; }

function sticky(num, clamper) { return Math.round(num / clamper) * clamper; }

function distributeAngles(me, total) { return me / total * 360; }

function getAngle(cx, cy, ex, ey) {
  var dy = ey - cy, dx = ex - cx;
  var theta = Math.atan2(dy, dx) * 180 / Math.PI;
  if (theta < 0) theta += 360;
  return theta === 360 ? 0 : theta;
}

function wrap(pos, padding_min, padding_max) {
  padding_min = padding_min || 0;
  padding_max = padding_max || padding_min;
  if (pos.x > w - padding_min) pos.x = padding_max;
  else if (pos.x < padding_max) pos.x = w - padding_min;
  if (pos.y > h - padding_min) pos.y = padding_max;
  else if (pos.y < padding_max) pos.y = h - padding_min;
}

function bounce(pos, min, max, sz) {
  sz = sz || 0;
  return (pos > max - sz / 2 || pos < min + sz / 2);
}

function mag(x, y) { return Math.sqrt(x * x + y * y); }

function makeGrid(_w, _h) {
  var grid = [], k = 0;
  for (var y = 0; y < _h; y++) {
    for (var x = 0; x < _w; x++) { grid[k] = [x, y]; k++; }
  }
  return grid;
}

function createGrid(_gw, _gh, _w, _h) {
  if (_w === undefined) _w = w;
  if (_h === undefined) _h = h;
  var spacing_x = _w / _gw, spacing_y = _h / _gh;
  var grid = [], k = 0;
  for (var y = 0; y < _gh; y++) {
    for (var x = 0; x < _gw; x++) {
      grid[k] = { 0: x * spacing_x + spacing_x / 2, 1: y * spacing_y + spacing_y / 2, x: x * spacing_x + spacing_x / 2, y: y * spacing_y + spacing_y / 2 };
      k++;
    }
  }
  return grid;
}

function colourPool() {
  this.pool = [];
  this.weights = [];
  this.colour_list = [];
  this.add = function(_colour, _weight) {
    if (_weight == undefined) _weight = 1;
    this.pool.push(_colour);
    this.weights.push(_weight);
    this.colour_list = this.generateWeighedList(this.pool, this.weights);
    return this;
  };
  this.get = function(n) {
    if (n == undefined) n = randomInt(this.pool.length - 1);
    return this.pool[n];
  };
  this.generateWeighedList = function(list, weight) {
    var weighed_list = [];
    for (var i = 0; i < weight.length; i++) {
      for (var j = 0; j < weight[i] * 100; j++) weighed_list.push(list[i]);
    }
    return weighed_list;
  };
  return this;
}

function Grid(_num_items_horiz, _num_items_vert, _grid_w, _grid_h, _startx, _starty) {
  if (_num_items_horiz == undefined) _num_items_horiz = 1;
  if (_num_items_vert == undefined) _num_items_vert = 1;
  var _horiz = _num_items_horiz || 1;
  var _vert = _num_items_vert || 1;
  this.length = 0;
  this.spacing_x = undefined;
  this.spacing_y = undefined;
  this.c = rgb(200);
  this.num_items_horiz = 0;
  this.num_items_vert = 0;
  this.start = { x: _startx || 0, y: _starty || 0 };
  this.grid_w = this.w = _grid_w || window.innerWidth;
  this.grid_h = this.h = _grid_h || window.innerHeight;
  this.width = _grid_w || window.innerWidth;
  this.height = _grid_h || window.innerHeight;
  this.centre = { x: this.start.x + this.width / 2, y: this.start.y + this.height / 2 };
  this.grid = [];
  this.edge = [];
  this.x = [];
  this.y = [];
  this.rows = [];
  this.cols = [];
  this.pos = [];

  this.add = function(_horiz, _vert) {
    this.num_items_horiz += _horiz || 1;
    this.num_items_vert += _vert || 1;
    this.spacing_x = this.width / this.num_items_horiz;
    this.spacing_y = this.height / this.num_items_vert;
    this.spacing = new Vector(this.spacing_x, this.spacing_y);
    this.createGrid();
    return this;
  };

  this.createGrid = function() {
    var r = 0;
    this.spacing_x = this.width / this.num_items_horiz;
    this.spacing_y = this.height / this.num_items_vert;
    this.spacing = new Vector(this.spacing_x, this.spacing_y);
    this.cols = [];
    for (var y = 0; y < this.num_items_vert; y++) {
      var c = 0;
      var row = [];
      var yy = y * this.spacing_y + this.spacing_y / 2 + this.start.y;
      for (var x = 0; x < this.num_items_horiz; x++) {
        var edge = false;
        var xx = x * this.spacing_x + this.spacing_x / 2 + this.start.x;
        if ((y == this.start.y || y == this.num_items_vert) && (x == this.start.x || x == this.num_items_horiz)) edge = true;
        this.x.push(xx);
        this.y.push(yy);
        this.pos.push({ row: r, col: c, x: xx, y: yy });
        row.push({ x: xx, y: yy });
        this.edge.push(edge);
        this.grid.push({ row: y, col: x, x: xx, y: yy, edge: edge, c: this.c, r: 255, g: 255, b: 255 });
        c++;
      }
      this.cols[x] = { col: x, x: xx, y: yy };
      this.rows[r] = { row: r, items: this.num_items_horiz, pos: row };
      r++;
    }
    this.length = this.num_items_vert * this.num_items_horiz;
    this.grid.push({ row: this.rows, col: this.cols });
  };

  this.add(_horiz, _vert);
  return this;
}
