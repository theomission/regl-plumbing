
module.exports = {};

const assert = require('assert');
const clone = require('clone');
const Type = require('type-of-is');

/**
 * Like Promise.all(), except that the list is a list of functions, and the resulting promises are executed sequentially.
 *
 * The results of each function are chained into the arguments of the next.
 *
 * If the result of a function is a Promise, then it will be resolved before the next job is executed, and the resulting
 * value will be fed in as the argument of the next job.
 */
function allSync (jobs) {
  let initialValue = null;
  return jobs.reduce(
    (lhs, rhs) => (lhs instanceof Promise) ? lhs.then((result) => Promise.resolve(rhs(result))) : rhs(lhs),
    initialValue
  );
}

function resolve (value, done) {
  if (value instanceof Promise) {
    value.then(function (resolved) {
      done(null, resolved);
    }).catch(function (err) {
      done(err);
    });
  } else {
    done(null, value);
  }
}

/**
 * If you think of a nested dictionary as a tree, then this function will visit every node in the tree.
 *
 */
function maptree ({value, leafVisitor, preVisitor = null, postVisitor = null, path = [], depth = 0, maxDepth = 10}) {
  if (depth > maxDepth) {
    throw new Error('Tree recursion reached maximum depth');
  }

  // if there is a preVisitor, then transform the initial value via the visitor
  if (preVisitor) {
    value = preVisitor({value, path});
  }

  let childPath = clone(path).concat([0]);
  assert(childPath.length === path.length + 1);

  let result;
  if (!Type.is(value, Object) && !Type.is(value, Array)) {
  // if (!isPlainObject(value) && !Type.is(value, Array)) {
    result = leafVisitor({value, path});
  } else if (Type.is(value, Object)) {
  // } else if (isPlainObject(value)) {
    // result is the new resulting value dictionary.
    result = {};
    // TODO provide a callback to process the keys.

    for (let key of Object.keys(value)) {
      let childValue = value[key];

      childPath[childPath.length - 1] = key;

      childValue = maptree({value: childValue, path: childPath, leafVisitor, preVisitor, postVisitor, depth: depth + 1});
      result[key] = childValue;
    }
  } else if (Type.is(value, Array)) {
    // result is the new resulting value list.
    result = [];

    for (let index = 0; index < value.length; ++index) {
      let childValue = value[index];

      childPath[childPath.length - 1] = index;

      childValue = maptree({value: childValue, path: childPath, leafVisitor, preVisitor, postVisitor, depth: depth + 1});
      result.push(childValue);
    }
  } else {
    assert(false);
  }

  value = result;

  if (postVisitor) {
    value = postVisitor({value, path});
  }

  return value;
}

function reducetree ({value, visitor, path = []}) {
  function leafVisitor ({value, path}) {
    return value;
  }

  function postVisitor ({value, path}) {
    return visitor({value, path});
  }

  return maptree({value, path, leafVisitor, postVisitor});
}

function mapsearch ({value, needle}) {
  return reducetree({
    value,
    visitor: function ({value}) {
      if (value === needle) {
        return true;
      }

      if (Type.is(value, Object) || Type.is(value, Array)) {
        for (let key of Object.keys(value)) {
          assert(value[key] === true || value[key] === false);
          if (value[key]) {
            return true;
          }
        }
      }

      return false;
    }
  });
}

function filtertree ({value, preVisitor = null, postVisitor = null, path = [], depth = 0, maxDepth = 10, missing = {}}) {
  if (depth > maxDepth) {
    throw new Error('Tree recursion reached maximum depth');
  }

  if (preVisitor && !preVisitor({value, path})) {
    return missing;
  }

  let result = null;

  if (!Type.is(value, Object) && !Type.is(value, Array)) {
    result = value;
  } else if (Type.is(value, Object)) {
    result = {};

    for (let key of Object.keys(value)) {
      let childValue = value[key];

      let childPath = clone(path).concat([key]);

      childValue = filtertree({value: childValue, path: childPath, preVisitor, postVisitor, missing: NOVALUE, depth: depth + 1});

      if (childValue === NOVALUE) {
        continue;
      }

      result[key] = childValue;
    }
  } else if (Type.is(value, Array)) {
    // result is the new resulting value list.
    result = [];

    for (let index = 0; index < value.length; ++index) {
      let childValue = value[index];

      let childPath = clone(path).concat([index]);

      childValue = filtertree({value: childValue, path: childPath, preVisitor, postVisitor, missing: NOVALUE, depth: depth + 1});
      if (childValue === NOVALUE) {
        continue;
      }

      result.push(childValue);
    }
  } else {
    assert(false);
  }

  if (postVisitor && !postVisitor({value: result, path})) {
    return missing;
  }

  return result;
}

// a `__hasitem__()` is reused several times, so we use this one to avoid duplication of code.
function __hasitem__ (subscript) {
  if (!Type.is(subscript, String)) {
    return false;
  }

  if (subscript.startsWith('_')) {
    return false;
  }

  // if (this.hasOwnProperty(subscript)) {
  //   return true;
  // }
  // if (Object.getPrototypeOf(this).hasOwnProperty(subscript)) {
  //   return true;
  // }

  return true;
}

// a `__box__()` is reused several times, so we use this one to avoid duplication of code.
function __box__ () {
  // if this is a proxy,
  if ('__proxy__' in this) {
    assert('__unbox__' in this);
    assert(this.__unbox__().proxy === this);
    assert('__proxy__' in this.proxy);

    return this;
  }

  assert('__proxy__' in this.proxy);

  return this.proxy;
}

function __unbox__ () {
  // this function should never be called from a proxy, since proxy specially intercepts and
  // handles this call
  assert(!('__proxy__' in this));

  return this;
}

function clear (thing) {
  if (Type.is(thing, Object)) {
    for (let key of Object.keys(thing)) {
      delete thing[key];
    }
  } else if (Type.is(thing, Array)) {
    thing.splice(0);
    assert(thing.length === 0);
  } else {
    assert(false);
  }
}

// standard handler for the Proxy for syntax sugar stuff. Delegates to python-like
// class functions.
let accessHandler = {
  apply: function (obj, thisArg, argumentsList) {
    return obj.__call__.apply(obj, argumentsList);
  },
  get: function (obj, prop) {
    if (prop === '__proxy__') {
      return () => true;
    }

    if (prop === '__unbox__') {
      return () => obj;
    }

    if (prop === '__box__') {
      return () => obj.__box__();
    }
    if (prop === '__rthis__') {
      return () => obj;
    }

    if ('__getitem__' in obj) {
      return obj.__getitem__(prop);
    }

    return obj[prop];
  },
  has: function (obj, prop) {
    if (prop === '__proxy__') {
      return true;
    }

    if (prop === '__unbox__') {
      return true;
    }

    if (prop === '__box__') {
      return true;
    }

    if (prop === '__rthis__') {
      return true;
    }

    if ('__hasitem__' in obj) {
      return obj.__hasitem__(prop);
    }

    // default functionality
    return prop in obj;
  },
  set: function (obj, prop, value) {
    if ('__setitem__' in obj) {
      return obj.__setitem__(prop, value);
    }

    obj[prop] = value;

    return true;
  }
};

// default argument; we use this special object so that undefined can be detected as a special case.
class NOVALUET { }
const NOVALUE = new NOVALUET();

module.exports.allSync = allSync;
module.exports.resolve = resolve;
module.exports.accessHandler = accessHandler;
module.exports.maptree = maptree;
module.exports.reducetree = reducetree;
module.exports.filtertree = filtertree;
module.exports.mapsearch = mapsearch;
module.exports.__hasitem__ = __hasitem__;
module.exports.__box__ = __box__;
module.exports.__unbox__ = __unbox__;
module.exports.NOVALUE = NOVALUE;
module.exports.clear = clear;
