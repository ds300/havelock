import * as util from './util';
import * as reactors from './reactors';

export function createPrototype (D, opts) {
  var x = {
    /**
     * Creates a derived value whose state will always be f applied to this
     * value
     */
    derive: function (f, a, b, c, d) {
      var that = this;
      switch (arguments.length) {
      case 0:
        throw new Error('.derive takes at least one argument');
      case 1:
        switch (typeof f) {
          case 'function':
            return D.derivation(function () {
              return f(that.get());
            });
          case 'string':
          case 'number':
            return D.derivation(function () {
              return that.get()[D.unpack(f)];
            });
          default:
            if (f instanceof Array) {
              return f.map(function (x) {
                return that.derive(x);
              });
            } else if (f instanceof RegExp) {
              return D.derivation(function () {
                return that.get().match(f);
              });
            } else if (D.isDerivable(f)) {
              return D.derivation(function () {
                var deriver = f.get();
                var thing = that.get();
                switch (typeof deriver) {
                  case 'function':
                    return deriver(thing);
                  case 'string':
                  case 'number':
                    return thing[deriver];
                  default:
                    if (deriver instanceof RegExp) {
                      return thing.match(deriver);
                    } else {
                      throw Error('type error');
                    }
                }
              });
            } else {
              throw Error('type error');
            }
        }
      case 2:
        return D.derivation(function () {
          return f(that.get(), D.unpack(a));
        });
      case 3:
        return D.derivation(function () {
          return f(that.get(), D.unpack(a), D.unpack(b));
        });
      case 4:
        return D.derivation(function () {
          return f(that.get(),
                   D.unpack(a),
                   D.unpack(b),
                   D.unpack(c));
        });
      case 5:
        return D.derivation(function () {
          return f(that.get(),
                   D.unpack(a),
                   D.unpack(b),
                   D.unpack(c),
                   D.unpack(d));
        });
      default:
        var args = ([that]).concat(util.slice(arguments, 1));
        return D.derivation(function () {
          return f.apply(null, args.map(D.unpack));
        });
      }
    },



    reactor: function (f) {
      if (typeof f === 'function') {
        return new reactors.Reactor(f, this);
      } else if (f instanceof reactors.Reactor) {
        if (typeof f.react !== 'function') {
          throw new Error('reactor missing .react method');
        }
        f._derivable = this;
        return f;
      } else if (f && f.react) {
        return util.assign(new reactors.Reactor(null, this), f);
      } else {
        throw new Error("Unrecognized type for reactor " + f);
      }
    },

    react: function (f, opts) {
      if (typeof f !== 'function') {
        throw Error('the first argument to .react must be a function');
      }

      opts = util.assign({
        once: false,
        from: true,
        until: false,
        when: true,
        skipFirst: false,
      }, opts);

      // coerce fn or bool to derivable<bool>
      function condDerivable(fOrD, name) {
        if (!D.isDerivable(fOrD)) {
          if (typeof fOrD === 'function') {
            fOrD = D.derivation(fOrD);
          } else if (typeof fOrD === 'boolean') {
            fOrD = D.atom(fOrD);
          } else {
            throw Error('react ' + name + ' condition must be derivable');
          }
        }
        return fOrD;
      }

      // wrap reactor so f doesn't get a .this context, and to allow
      // stopping after one reaction if desired.
      var reactor = this.reactor({
        react: function (val) {
          if (opts.skipFirst) {
            opts.skipFirst = false;
          } else {
            f(val);
            if (opts.once) {
              this.stop();
              controller.stop();
            }
          }
        },
        onStart: opts.onStart,
        onStop: opts.onStop
      });

      // listen to when and until conditions, starting and stopping the
      // reactor as appropriate, and stopping this controller when until
      // condition becomes true
      var controller = D.struct({
        until: condDerivable(opts.until, 'until'),
        when: condDerivable(opts.when, 'when')
      }).reactor(function (conds) {
        if (conds.until) {
          reactor.stop();
          this.stop();
        } else if (conds.when) {
          if (!reactor.isActive()) {
            reactor.start().force();
          }
        } else if (reactor.isActive()) {
          reactor.stop();
        }
      });

      // listen to from condition, starting the reactor controller
      // when appropriate
      condDerivable(opts.from, 'from').reactor(function (from) {
        if (from) {
          controller.start().force();
          this.stop();
        }
      }).start().force();
    },

    is: function (other) {
      return D.lift(this._equals || opts.equals)(this, other);
    },

    and: function (other) {
      return this.derive(function (x) {return x && D.unpack(other);});
    },

    or: function (other) {
      return this.derive(function (x) {return x || D.unpack(other);});
    },

    then: function (thenClause, elseClause) {
      return this.derive(function (x) {
        return D.unpack(x ? thenClause : elseClause);
      });
    },

    mThen: function (thenClause, elseClause) {
      return this.derive(function (x) {
        return D.unpack(util.some(x) ? thenClause : elseClause);
      });
    },

    mOr: function (other) {
      return this.mThen(this, other);
    },

    mDerive: function (arg) {
      if (arguments.length === 1 && arg instanceof Array) {
        var that = this;
        return arg.map(function (a) { return that.mDerive(a); });
      } else {
        return this.mThen(this.derive.apply(this, arguments));
      }
    },

    mAnd: function (other) {
      return this.mThen(other, this);
    },

    not: function () {
      return this.derive(function (x) { return !x; });
    },

    withEquality: function (equals) {
      if (equals) {
        if (typeof equals !== 'function') {
          throw new Error('equals must be function');
        }
      } else {
        equals = null;
      }

      return util.setEquals(this._clone(), equals);
    },

    __equals: function (a, b) {
      return (this._equals || opts.equals)(a, b);
    },
  };

  x.switch = function () {
    var args = arguments;
    return this.derive(function (x) {
      var i;
      for (i = 0; i < args.length-1; i+=2) {
        if (opts.equals(x, D.unpack(args[i]))) {
          return D.unpack(args[i+1]);
        }
      }
      if (i === args.length - 1) {
        return D.unpack(args[i]);
      }
    });
  };

  return x;
};
