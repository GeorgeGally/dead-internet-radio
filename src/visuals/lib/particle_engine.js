var particleEngine = function(_gw, _gh, _grid_w, _grid_h, _startx, _starty){

  var gw = _gw || 0;
  var gh = _gh || 0;

  this.start = {x: _startx || 0, y: _starty || 0};
  this.width = _grid_w || window.innerWidth;
  this.height = _grid_h || window.innerHeight;

  this.bounce = false;
  this.edges = true;
  this.reset = false;
  this.MAXPARTICLES = 10000;
  this.particles = [];

  this.spacing = 0;
  this.border = true;
  this.speed = new Vector(random(0.2,2), random(0.2,2));
  this.length = 0;
  this.tween_speed = 10;
  this.pos = new Vector();
  this.last = [];

  if(gw > 0) {
    this.grid = new Grid(gw, gh, this.width, this.height, this.start.x, this.start.y);
    var num_particles = this.grid.length;
    this.rows = this.grid.rows;
    this.cols = this.grid.cols;
  }

  this.setup = function() {
    for (var i = 0; i < num_particles; i++) {
      var cc = rgb(0);
      this.add(this.grid.x[i], this.grid.y[i], cc, i);
    }
  };

  this.add = function(_x, _y, _colour, _me) {
    var row = 0;
    var col = 0;
    var x = _x || window.innerWidth / 2;
    var y = _y || window.innerHeight / 2;
    var colour = _colour || "black";
    var me = _me || this.particles.length;
    var angle = radians(distributeAngles(me, this.particles.length));
    var speed = new Vector(random(0.2,2), random(0.2,2));
    var accel = new Vector(1,1);
    if(this.grid) {
      if (this.grid.grid[me]) {
        row = this.grid.grid[me].row;
        col = this.grid.grid[me].col;
      } else {
        row = 1;
        col = 1;
      }
    }
    var particle = {
      me: me,
      pos: new Vector(x, y, 1),
      start: new Vector(x, y, 1),
      target: new Vector(x, y, 1),
      old: new Vector(x, y, 1),
      end: new Vector(x, y, 1),
      pos3d: new Vector(x, y, 1),
      row: row,
      col: col,
      speed: speed,
      start_speed: speed,
      accel: accel,
      start_accel: new Vector(accel.x, accel.y),
      vel: speed,
      velocity: speed,
      dir: new Vector(1, 1),
      acceleration: new Vector(1,1),
      c: colour,
      alpha: 1,
      tween_speed: this.tween_speed,
      tween: true,
      r: 0,
      target_r: 0,
      sz: 4,
      scale: 1,
      orig_sz: 5,
      target_sz: 5,
      target_size: 5,
      size: 4,
      on: true,
      isSpring: false,
      spring: 0.03,
      friction: 0.98,
      angle: angle
    };

    if (this.grid) {
      particle.w = this.grid.spacing.x;
      particle.h = this.grid.spacing.y;
      particle.ht = this.grid.spacing.y;
      particle.neighbours = neighbours;
      particle.sz = this.grid.spacing.x;
    }

    this.particles.push(particle);
    this.last = particle;
    this.length = this.particles.length;
    this.resetAngles();
  };

  var neighbours = { top: -1, right: -1, bottom: -1, left: -1 };

  this.draw = function(_ctx) {
    var ctx = _ctx || ctx;
    this.update();
    this.drawParticles(ctx);
  };

  this.setSpeed = function(_x1, _x2, _y1, _y2) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if(!_y1) p.speed = new Vector(_x1, _x2);
      else p.speed = new Vector(random(_x1, _x2), random(_y1, _y2));
    }
  };

  this.setSize = function(min, max) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.w = min;
      p.h = max || h;
      if(!max) { p.sz = min; p.target_sz = min; }
      else { p.sz = random(min, max); p.target_sz = p.sz; }
    }
  };

  this.setPos = function(x, y) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.pos.x = p.start.x = x || random(window.innerWidth);
      p.pos.y = p.start.y = y || random(window.innerHeight);
    }
  };

  this.setTarget = function(x, y) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.target.x = x || window.innerWidth / 2;
      p.target.y = y || window.innerHeight / 2;
    }
  };

  this.setAccel = function(_x1, _x2, _y1, _y2) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.accel = new Vector(random(_x1, _x2), random(_y1, _y2));
      p.start_accel = p.accel;
    }
  };

  this.setDir = function(_x, _y) {
    var x = _x || posNeg();
    var y = _y || posNeg();
    for (var i = 0; i < this.particles.length; i++) { p.dir = new Vector(x, y); }
  };

  this.setColour = function(c) {
    for (var i = 0; i < this.particles.length; i++) { this.particles[i].c = c; }
  };

  this.setRandomColour = function(r1, r2, g1, g2, b1, b2) {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if(g1 == undefined) p.c = rgb(random(r1, r2));
      else p.c = rgb(random(r1, r2), random(g1, g2), random(b1, b2));
    }
  };

  this.randomize = function() {
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i].pos.x = random(window.innerWidth);
      this.particles[i].pos.y = random(window.innerHeight);
    }
  };

  this.get = function(i) { return this.particles[i]; };

  this.resetAngles = function() {
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i].angle = radians(distributeAngles(i, this.particles.length));
    }
  };

  this.delete = function(_me) {
    if (_me === undefined) _me = 0;
    this.particles.splice(_me, 1);
    this.length = this.particles.length;
    for (var i = 0; i < this.length; i++) { this.particles[i].me = i; }
    this.spacing = 360 / this.particles.length;
  };

  this.drawParticles = function(_ctx) {
    var ctx = _ctx || ctx;
    for (var i = 0; i < this.length; i++) {
      var p = this.particles[i];
      ctx.fillStyle = p.c;
      ctx.fillEllipse(p.pos.x, p.pos.y, p.sz, p.sz);
    }
  };

  this.update = function() {
    for (var i = 0; i < this.length; i++) {
      var p = this.particles[i];
      if (p.isSpring) { updateSpring(p); }
      else { this.move(p); this.offCanvasTest(p); }
    }
  };

  this.move = function(p) {
    p.old = p.pos;
    if (p.tween == false) {
      p.pos.x += (p.speed.x * p.accel.x) * p.dir.x;
      p.pos.y += (p.speed.y * p.accel.y) * p.dir.y;
    } else {
      p.target.x += (p.speed.x * p.accel.x) * p.dir.x;
      p.target.y += (p.speed.y * p.accel.y) * p.dir.y;
      p.sz = tween(p.sz, p.target_sz, p.tween_speed);
      p.pos.x = tween(p.pos.x, p.target.x, p.tween_speed);
      p.pos.y = tween(p.pos.y, p.target.y, p.tween_speed);
    }
  };

  this.offCanvasTest = function(p) {
    var ww = window.innerWidth, hh = window.innerHeight;
    if(!this.edge) {
      if (p.pos.x > ww || p.pos.y > hh || p.pos.x < 0 || p.pos.y < 0) this.delete(p.me);
    } else if(this.border) {
      if (this.bounce) {
        if (bounce(p.x, 0, ww, p.sz)) { p.speed.x *= -1; if (this.reset) this.resetParticle(p); }
        if (bounce(p.y, 0, hh, p.sz)) { p.speed.y *= -1; if (this.reset) this.resetParticle(p); }
      } else {
        if (p.pos.x > ww) { p.pos.x = p.target.x = 0; if (this.reset) this.resetParticle(p); }
        if (p.pos.y > hh) { p.pos.y = p.target.y = 0; if (this.reset) this.resetParticle(p); }
        if (p.pos.x < 0) { p.pos.x = p.target.x = ww; if (this.reset) this.resetParticle(p); }
        if (p.pos.y < 0) { p.pos.y = p.target.y = hh; if (this.reset) this.resetParticle(p); }
      }
    }
  };

  this.resetParticle = function(p) {
    p.speed.y = random(1);
    p.start_accel.y = random(0.5);
    p.accel.y = p.start_accel.y;
  };

  function updateSpring(b) {
    var dx = b.target.x - b.pos.x;
    var dy = b.target.y - b.pos.y;
    var ax = dx * b.spring, ay = dy * b.spring;
    b.speed.x += ax; b.speed.y += ay;
    b.speed.x *= b.friction; b.speed.y *= b.friction;
    b.pos.x += b.speed.x; b.pos.y += b.speed.y;
  }

  this.respace = function() {
    for (var i = 0; i < this.particles.length; i++) {
      this.particles[i].target.x = this.grid[i].x;
      this.particles[i].target.y = this.grid[i].y;
    }
  };

  this.setup();
};
