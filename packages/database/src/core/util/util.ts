/**
 * @license
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Query } from '../../api/Query';

declare const window: any;
declare const Windows: any;

import { assert , base64 , Sha1 , stringToByteArray , stringify , isNodeSdk } from '@firebase/util';




import { SessionStorage } from '../storage/storage';

import { Logger, LogLevel } from '@firebase/logger';

const logClient = new Logger('@firebase/database');

/**
 * Returns a locally-unique ID (generated by just incrementing up from 0 each time its called).
 * @type {function(): number} Generated ID.
 */
export const LUIDGenerator: () => number = (function() {
  let id = 1;
  return function() {
    return id++;
  };
})();

/**
 * Sha1 hash of the input string
 * @param {!string} str The string to hash
 * @return {!string} The resulting hash
 */
export const sha1 = function(str: string): string {
  const utf8Bytes = stringToByteArray(str);
  const sha1 = new Sha1();
  sha1.update(utf8Bytes);
  const sha1Bytes = sha1.digest();
  return base64.encodeByteArray(sha1Bytes);
};

/**
 * @param {...*} varArgs
 * @return {string}
 * @private
 */
const buildLogMessage_ = function(...varArgs: any[]): string {
  let message = '';
  for (let i = 0; i < varArgs.length; i++) {
    if (
      Array.isArray(varArgs[i]) ||
      (varArgs[i] &&
        typeof varArgs[i] === 'object' &&
        typeof varArgs[i].length === 'number')
    ) {
      message += buildLogMessage_.apply(null, varArgs[i]);
    } else if (typeof varArgs[i] === 'object') {
      message += stringify(varArgs[i]);
    } else {
      message += varArgs[i];
    }
    message += ' ';
  }

  return message;
};

/**
 * Use this for all debug messages in Firebase.
 * @type {?function(string)}
 */
export let logger: ((a: string) => void) | null = null;

/**
 * Flag to check for log availability on first log message
 * @type {boolean}
 * @private
 */
let firstLog_ = true;

/**
 * The implementation of Firebase.enableLogging (defined here to break dependencies)
 * @param {boolean|?function(string)} logger_ A flag to turn on logging, or a custom logger
 * @param {boolean=} persistent Whether or not to persist logging settings across refreshes
 */
export const enableLogging = function(
  logger_?: boolean | ((a: string) => void) | null,
  persistent?: boolean
) {
  assert(
    !persistent || logger_ === true || logger_ === false,
    "Can't turn on custom loggers persistently."
  );
  if (logger_ === true) {
    logClient.logLevel = LogLevel.VERBOSE;
    logger = logClient.log.bind(logClient);
    if (persistent) {SessionStorage.set('logging_enabled', true);}
  } else if (typeof logger_ === 'function') {
    logger = logger_;
  } else {
    logger = null;
    SessionStorage.remove('logging_enabled');
  }
};

/**
 *
 * @param {...(string|Arguments)} varArgs
 */
export const log = function(...varArgs: string[]) {
  if (firstLog_ === true) {
    firstLog_ = false;
    if (logger === null && SessionStorage.get('logging_enabled') === true)
      {enableLogging(true);}
  }

  if (logger) {
    const message = buildLogMessage_.apply(null, varArgs);
    logger(message);
  }
};

/**
 * @param {!string} prefix
 * @return {function(...[*])}
 */
export const logWrapper = function(
  prefix: string
): (...varArgs: any[]) => void {
  return function(...varArgs: any[]) {
    log(prefix, ...varArgs);
  };
};

/**
 * @param {...string} varArgs
 */
export const error = function(...varArgs: string[]) {
  const message = 'FIREBASE INTERNAL ERROR: ' + buildLogMessage_(...varArgs);
  logClient.error(message);
};

/**
 * @param {...string} varArgs
 */
export const fatal = function(...varArgs: string[]) {
  const message = `FIREBASE FATAL ERROR: ${buildLogMessage_(...varArgs)}`;
  logClient.error(message);
  throw new Error(message);
};

/**
 * @param {...*} varArgs
 */
export const warn = function(...varArgs: any[]) {
  const message = 'FIREBASE WARNING: ' + buildLogMessage_(...varArgs);
  logClient.warn(message);
};

/**
 * Logs a warning if the containing page uses https. Called when a call to new Firebase
 * does not use https.
 */
export const warnIfPageIsSecure = function() {
  // Be very careful accessing browser globals. Who knows what may or may not exist.
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.protocol &&
    window.location.protocol.indexOf('https:') !== -1
  ) {
    warn(
      'Insecure Firebase access from a secure page. ' +
        'Please use https in calls to new Firebase().'
    );
  }
};

/**
 * @param {!String} methodName
 */
export const warnAboutUnsupportedMethod = function(methodName: string) {
  warn(
    methodName +
      ' is unsupported and will likely change soon.  ' +
      'Please do not use.'
  );
};

/**
 * Returns true if data is NaN, or +/- Infinity.
 * @param {*} data
 * @return {boolean}
 */
export const isInvalidJSONNumber = function(data: any): boolean {
  return (
    typeof data === 'number' &&
    (data !== data || // NaN
      data === Number.POSITIVE_INFINITY ||
      data === Number.NEGATIVE_INFINITY)
  );
};

/**
 * @param {function()} fn
 */
export const executeWhenDOMReady = function(fn: () => void) {
  if (isNodeSdk() || document.readyState === 'complete') {
    fn();
  } else {
    // Modeled after jQuery. Try DOMContentLoaded and onreadystatechange (which
    // fire before onload), but fall back to onload.

    let called = false;
    const wrappedFn = function() {
      if (!document.body) {
        setTimeout(wrappedFn, Math.floor(10));
        return;
      }

      if (!called) {
        called = true;
        fn();
      }
    };

    if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', wrappedFn, false);
      // fallback to onload.
      window.addEventListener('load', wrappedFn, false);
    } else if ((document as any).attachEvent) {
      // IE.
      (document as any).attachEvent('onreadystatechange', () => {
        if (document.readyState === 'complete') {wrappedFn();}
      });
      // fallback to onload.
      (window as any).attachEvent('onload', wrappedFn);

      // jQuery has an extra hack for IE that we could employ (based on
      // http://javascript.nwbox.com/IEContentLoaded/) But it looks really old.
      // I'm hoping we don't need it.
    }
  }
};

/**
 * Minimum key name. Invalid for actual data, used as a marker to sort before any valid names
 * @type {!string}
 */
export const MIN_NAME = '[MIN_NAME]';

/**
 * Maximum key name. Invalid for actual data, used as a marker to sort above any valid names
 * @type {!string}
 */
export const MAX_NAME = '[MAX_NAME]';

/**
 * Compares valid Firebase key names, plus min and max name
 * @param {!string} a
 * @param {!string} b
 * @return {!number}
 */
export const nameCompare = function(a: string, b: string): number {
  if (a === b) {
    return 0;
  } else if (a === MIN_NAME || b === MAX_NAME) {
    return -1;
  } else if (b === MIN_NAME || a === MAX_NAME) {
    return 1;
  } else {
    const aAsInt = tryParseInt(a),
      bAsInt = tryParseInt(b);

    if (aAsInt !== null) {
      if (bAsInt !== null) {
        return aAsInt - bAsInt === 0 ? a.length - b.length : aAsInt - bAsInt;
      } else {
        return -1;
      }
    } else if (bAsInt !== null) {
      return 1;
    } else {
      return a < b ? -1 : 1;
    }
  }
};

/**
 * @param {!string} a
 * @param {!string} b
 * @return {!number} comparison result.
 */
export const stringCompare = function(a: string, b: string): number {
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
};

/**
 * @param {string} key
 * @param {Object} obj
 * @return {*}
 */
export const requireKey = function(
  key: string,
  obj: { [k: string]: any }
): any {
  if (obj && key in obj) {
    return obj[key];
  } else {
    throw new Error(
      'Missing required key (' + key + ') in object: ' + stringify(obj)
    );
  }
};

/**
 * @param {*} obj
 * @return {string}
 */
export const ObjectToUniqueKey = function(obj: any): string {
  if (typeof obj !== 'object' || obj === null) {return stringify(obj);}

  const keys = [];
  // eslint-disable-next-line guard-for-in
  for (const k in obj) {
    keys.push(k);
  }

  // Export as json, but with the keys sorted.
  keys.sort();
  let key = '{';
  for (let i = 0; i < keys.length; i++) {
    if (i !== 0) {key += ',';}
    key += stringify(keys[i]);
    key += ':';
    key += ObjectToUniqueKey(obj[keys[i]]);
  }

  key += '}';
  return key;
};

/**
 * Splits a string into a number of smaller segments of maximum size
 * @param {!string} str The string
 * @param {!number} segsize The maximum number of chars in the string.
 * @return {Array.<string>} The string, split into appropriately-sized chunks
 */
export const splitStringBySize = function(
  str: string,
  segsize: number
): string[] {
  const len = str.length;

  if (len <= segsize) {
    return [str];
  }

  const dataSegs = [];
  for (let c = 0; c < len; c += segsize) {
    if (c + segsize > len) {
      dataSegs.push(str.substring(c, len));
    } else {
      dataSegs.push(str.substring(c, c + segsize));
    }
  }
  return dataSegs;
};

/**
 * Apply a function to each (key, value) pair in an object or
 * apply a function to each (index, value) pair in an array
 * @param obj The object or array to iterate over
 * @param fn The function to apply
 */
export function each(obj: object, fn: (k: string, v: any) => void) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      fn(key, obj[key]);
    }
  }
}

/**
 * Like goog.bind, but doesn't bother to create a closure if opt_context is null/undefined.
 * @param {function(*)} callback Callback function.
 * @param {?Object=} context Optional context to bind to.
 * @return {function(*)}
 */
export const bindCallback = function(
  callback: (a: any) => void,
  context?: object | null
): Function {
  return context ? callback.bind(context) : callback;
};

/**
 * Borrowed from http://hg.secondlife.com/llsd/src/tip/js/typedarray.js (MIT License)
 * I made one modification at the end and removed the NaN / Infinity
 * handling (since it seemed broken [caused an overflow] and we don't need it).  See MJL comments.
 * @param {!number} v A double
 * @return {string}
 */
export const doubleToIEEE754String = function(v: number): string {
  assert(!isInvalidJSONNumber(v), 'Invalid JSON number'); // MJL

  const ebits = 11,
    fbits = 52;
  const bias = (1 << (ebits - 1)) - 1;
  let  s,
    e,
    f,
    ln,
    i;

  // Compute sign, exponent, fraction
  // Skip NaN / Infinity handling --MJL.
  if (v === 0) {
    e = 0;
    f = 0;
    s = 1 / v === -Infinity ? 1 : 0;
  } else {
    s = v < 0;
    v = Math.abs(v);

    if (v >= Math.pow(2, 1 - bias)) {
      // Normalized
      ln = Math.min(Math.floor(Math.log(v) / Math.LN2), bias);
      e = ln + bias;
      f = Math.round(v * Math.pow(2, fbits - ln) - Math.pow(2, fbits));
    } else {
      // Denormalized
      e = 0;
      f = Math.round(v / Math.pow(2, 1 - bias - fbits));
    }
  }

  // Pack sign, exponent, fraction
  const bits = [];
  for (i = fbits; i; i -= 1) {
    bits.push(f % 2 ? 1 : 0);
    f = Math.floor(f / 2);
  }
  for (i = ebits; i; i -= 1) {
    bits.push(e % 2 ? 1 : 0);
    e = Math.floor(e / 2);
  }
  bits.push(s ? 1 : 0);
  bits.reverse();
  const str = bits.join('');

  // Return the data as a hex string. --MJL
  let hexByteString = '';
  for (i = 0; i < 64; i += 8) {
    let hexByte = parseInt(str.substr(i, 8), 2).toString(16);
    if (hexByte.length === 1) {hexByte = '0' + hexByte;}
    hexByteString = hexByteString + hexByte;
  }
  return hexByteString.toLowerCase();
};

/**
 * Used to detect if we're in a Chrome content script (which executes in an
 * isolated environment where long-polling doesn't work).
 * @return {boolean}
 */
export const isChromeExtensionContentScript = function(): boolean {
  return !!(
    typeof window === 'object' &&
    window['chrome'] &&
    window['chrome']['extension'] &&
    !/^chrome/.test(window.location.href)
  );
};

/**
 * Used to detect if we're in a Windows 8 Store app.
 * @return {boolean}
 */
export const isWindowsStoreApp = function(): boolean {
  // Check for the presence of a couple WinRT globals
  return typeof Windows === 'object' && typeof Windows.UI === 'object';
};

/**
 * Converts a server error code to a Javascript Error
 * @param {!string} code
 * @param {!Query} query
 * @return {Error}
 */
export const errorForServerCode = function(code: string, query: Query): Error {
  let reason = 'Unknown Error';
  if (code === 'too_big') {
    reason =
      'The data requested exceeds the maximum size ' +
      'that can be accessed with a single request.';
  } else if (code === 'permission_denied') {
    reason = "Client doesn't have permission to access the desired data.";
  } else if (code === 'unavailable') {
    reason = 'The service is unavailable';
  }

  const error = new Error(
    code + ' at ' + query.path.toString() + ': ' + reason
  );
  (error as any).code = code.toUpperCase();
  return error;
};

/**
 * Used to test for integer-looking strings
 * @type {RegExp}
 * @private
 */
export const INTEGER_REGEXP_ = new RegExp('^-?(0*)\\d{1,10}$');

/**
 * If the string contains a 32-bit integer, return it.  Else return null.
 * @param {!string} str
 * @return {?number}
 */
export const tryParseInt = function(str: string): number | null {
  if (INTEGER_REGEXP_.test(str)) {
    const intVal = Number(str);
    if (intVal >= -2147483648 && intVal <= 2147483647) {
      return intVal;
    }
  }
  return null;
};

/**
 * Helper to run some code but catch any exceptions and re-throw them later.
 * Useful for preventing user callbacks from breaking internal code.
 *
 * Re-throwing the exception from a setTimeout is a little evil, but it's very
 * convenient (we don't have to try to figure out when is a safe point to
 * re-throw it), and the behavior seems reasonable:
 *
 * * If you aren't pausing on exceptions, you get an error in the console with
 *   the correct stack trace.
 * * If you're pausing on all exceptions, the debugger will pause on your
 *   exception and then again when we rethrow it.
 * * If you're only pausing on uncaught exceptions, the debugger will only pause
 *   on us re-throwing it.
 *
 * @param {!function()} fn The code to guard.
 */
export const exceptionGuard = function(fn: () => void) {
  try {
    fn();
  } catch (e) {
    // Re-throw exception when it's safe.
    setTimeout(() => {
      // It used to be that "throw e" would result in a good console error with
      // relevant context, but as of Chrome 39, you just get the firebase.js
      // file/line number where we re-throw it, which is useless. So we log
      // e.stack explicitly.
      const stack = e.stack || '';
      warn('Exception was thrown by user callback.', stack);
      throw e;
    }, Math.floor(0));
  }
};

/**
 * Helper function to safely call opt_callback with the specified arguments.  It:
 * 1. Turns into a no-op if opt_callback is null or undefined.
 * 2. Wraps the call inside exceptionGuard to prevent exceptions from breaking our state.
 *
 * @param {?Function=} callback Optional onComplete callback.
 * @param {...*} varArgs Arbitrary args to be passed to opt_onComplete
 */
export const callUserCallback = function(
  callback?: Function | null,
  ...varArgs: any[]
) {
  if (typeof callback === 'function') {
    exceptionGuard(() => {
      callback(...varArgs);
    });
  }
};

/**
 * @return {boolean} true if we think we're currently being crawled.
 */
export const beingCrawled = function(): boolean {
  const userAgent =
    (typeof window === 'object' &&
      window['navigator'] &&
      window['navigator']['userAgent']) ||
    '';

  // For now we whitelist the most popular crawlers.  We should refine this to be the set of crawlers we
  // believe to support JavaScript/AJAX rendering.
  // NOTE: Google Webmaster Tools doesn't really belong, but their "This is how a visitor to your website
  // would have seen the page" is flaky if we don't treat it as a crawler.
  return (
    userAgent.search(
      /googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i
    ) >= 0
  );
};

/**
 * Export a property of an object using a getter function.
 *
 * @param {!Object} object
 * @param {string} name
 * @param {!function(): *} fnGet
 */
export const exportPropGetter = function(
  object: object,
  name: string,
  fnGet: () => any
) {
  Object.defineProperty(object, name, { get: fnGet });
};

/**
 * Same as setTimeout() except on Node.JS it will /not/ prevent the process from exiting.
 *
 * It is removed with clearTimeout() as normal.
 *
 * @param {Function} fn Function to run.
 * @param {number} time Milliseconds to wait before running.
 * @return {number|Object} The setTimeout() return value.
 */
export const setTimeoutNonBlocking = function(
  fn: Function,
  time: number
): number | object {
  const timeout: number | object = setTimeout(fn, time);
  if (typeof timeout === 'object' && (timeout as any)['unref']) {
    (timeout as any)['unref']();
  }
  return timeout;
};
