/**
 *  Copyright (c) 2015, David Sheldrick.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree.
 */

import Set from './set'
import { NEW, CHANGED, UNCHANGED, ORPHANED, DISOWNED,
        UNSTABLE, STABLE, DERIVATION } from './gc'
import { capturingParents } from './parents'

export function createDerivationPrototype (havelock, { equals }) {
  return {
    _clone () {
      return havelock.derive(this._deriver);
    },

    _forceGet () {
      let newParents = capturingParents(() => {
        let newState = this._deriver();
        this._validate(newState);
        this._mode = equals(newState, this._state) ? UNCHANGED : CHANGED;
        this._state = newState;
      });

      // organise parents
      for (let possiblyFormerParent of this._parents) {
        if (!newParents[possiblyFormerParent._uid]) {
          // definitely former parent
          possiblyFormerParent._children.remove(this);
        }
      }

      this._parents = newParents;

      for (let p of newParents) {
        p._children.add(this);
      }
    },

    _get () {
      outer: switch (this._mode) {
      case NEW:
      case ORPHANED:
        this._forceGet();
        break;
      case UNSTABLE:
        for (let parent of this._parents) {
          if (parent._mode === UNSTABLE
              || parent._mode === ORPHANED
              || parent._mode === DISOWNED) {
            parent._get();
          }
          switch (parent._mode) {
          case STABLE:
          case UNCHANGED:
            // noop
            break;
          case CHANGED:
            this._forceGet();
            break outer;
          default:
            throw new Error(`invalid parent mode: ${parent._mode}`);
          }
        }
        this._mode = UNCHANGED;
        break;
      case DISOWNED:
        let parents = new Set();
        for (let [parent, state] of this._parents) {
          if (!equals(parent._get(), state)) {
            this._forceGet();
            break outer;
          } else {
            parents.add(parent);
          }
        }
        this._parents = parents;
        this._mode = UNCHANGED;
        break;
      default:
        // noop
      }

      return this._state;
    }
  }
}

export function createDerivation(obj, deriver) {
    obj._uid = Symbol("my_uid");
    obj._children = new Set();
    obj._parents = new Set();
    obj._deriver = deriver;
    obj._mode = NEW;
    obj._type = DERIVATION;
    obj._state = Symbol("null");
    return obj;
}
