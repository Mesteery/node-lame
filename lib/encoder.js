
/**
 * Module dependencies.
 */

import assert from 'assert';
import { Transform } from 'stream';
import binding from './bindings.js';

const LAME_OKAY = binding.LAME_OKAY;
const PCM_TYPE_SHORT_INT = binding.PCM_TYPE_SHORT_INT;
const PCM_TYPE_FLOAT = binding.PCM_TYPE_FLOAT;
const PCM_TYPE_DOUBLE = binding.PCM_TYPE_DOUBLE;

/**
 * Messages for error codes returned from the lame C encoding functions.
 */
const ERRORS = {
  '-1': 'output buffer too small',
  '-2': 'malloc() problems',
  '-3': 'lame_init_params() not called',
  '-4': 'psycho acoustic problems'
};

/**
 * Map of libmp3lame functions to node-lame property names.
 */

const PROPS = {
  'brate': 'bitRate',
  'num_channels': 'channels',
  'bWriteVbrTag': 'writeVbrTag',
  'in_samplerate': 'sampleRate',
  'out_samplerate': 'outSampleRate'
};

/**
 * The valid bit depths that lame supports encoding in.
 */
const SHORT_BITS = binding.sizeof_short * 8;
const FLOAT_BITS = binding.sizeof_float * 8;
const DOUBLE_BITS = binding.sizeof_double * 8;

/**
 * The `Encoder` class is a Transform stream class.
 * Write raw PCM data, out comes an MP3 file.
 *
 * @param {Object} options PCM stream format info and stream options
 * @api public
 */

export class Encoder extends Transform {
  constructor({ channels = 2, bitDepth = 16, simpleRate = 44100, signed = bitDepth !== 8, ...options } = {}) {
    super(options);

    // lame malloc()s the "gfp" buffer
    this.gfp = binding.lame_init();

    if (options.float && options.bitDepth == DOUBLE_BITS) {
      this.inputType = PCM_TYPE_DOUBLE;
    } else if (options.float && options.bitDepth == FLOAT_BITS) {
      this.inputType = PCM_TYPE_FLOAT;
    } else if (!options.float && options.bitDepth == SHORT_BITS) {
      this.inputType = PCM_TYPE_SHORT_INT;
    } else {
      throw new Error('unsupported PCM format!');
    }

    this.channels = channels;
    this.bitDepth = bitDepth;
    this.simpleRate = simpleRate;
    this.signed = signed;
  }

  /**
   * Called one time at the beginning of the first `_transform()` call.
   *
   * @api private
   */

  _init() {
    const r = binding.lame_init_params(this.gfp);
    if (LAME_OKAY !== r) {
      throw new Error(`error initializing params: ${r}`);
    }

    // constant: number of 'bytes per sample'
    this.blockAlign = this.bitDepth / 8 * this.channels;
  }

  /**
   * Calls `lame_encode_buffer_interleaved()` on the given "chunk.
   *
   * @api private
   */

  _transform(chunk, _encoding, done) {
    const self = this;
    if (!this._initCalled) {
      try {
        this._init();
      } catch (e) {
        return done(e);
      }
      this._initCalled = true;
    }

    // first handle any _remainder
    if (this._remainder) {
      chunk = Buffer.concat([this._remainder, chunk]);
      this._remainder = null;
    }

    // set any necessary _remainder (we can only send whole samples at a time)
    const remainder = chunk.length % this.blockAlign;
    if (remainder > 0) {
      const slice = chunk.length - remainder;
      this._remainder = chunk.slice(slice);
      chunk = chunk.slice(0, slice);
    }

    assert.strictEqual(chunk.length % this.blockAlign, 0);

    const numSamples = chunk.length / this.blockAlign;
    // TODO: Use better calculation logic from lame.h here
    const estimatedSize = 1.25 * numSamples + 7200;
    let output = Buffer.alloc(estimatedSize);

    binding.lame_encode_buffer(
      this.gfp,
      chunk,
      this.inputType,
      this.channels,
      numSamples,
      output,
      0,
      output.length,
      (bytesWritten) => {
        if (bytesWritten < 0) {
          const err = new Error(ERRORS[bytesWritten]);
          err.code = bytesWritten;
          done(err);
        } else if (bytesWritten > 0) {
          output = output.slice(0, bytesWritten);
          self.push(output);
          done();
        } else { // bytesWritten == 0
          done();
        }
      }
    );
  }

  /**
   * Calls `lame_encode_flush_nogap()` on the thread pool.
   */

  _flush(done) {
    const self = this;
    const estimated_size = 7200; // value specified in lame.h
    let output = Buffer.alloc(estimated_size);

    if (!this._initCalled) {
      try {
        this._init();
      } catch (e) {
        return done(e);
      }
      this._initCalled = true;
    }

    binding.lame_encode_flush_nogap(
      this.gfp,
      output,
      0,
      output.length,
      () => {
        binding.lame_close(self.gfp);
        self.gfp = null;

        if (bytesWritten < 0) {
          const err = new Error(ERRORS[bytesWritten]);
          err.code = bytesWritten;
          done(err);
        } else if (bytesWritten > 0) {
          output = output.slice(0, bytesWritten);
          self.push(output);
          done();
        } else { // bytesWritten == 0
          done();
        }
      }
    );
  }
}

/**
 * Define the getter/setters for the lame encoder settings.
 */

Object.keys(binding).forEach(key => {
  if (!/^lame_[gs]et/.test(key)) return;
  const name = key.substring(9);
  const prop = PROPS[name] || toCamelCase(name);
  const getter = 'g' === key[5];

  let desc = Object.getOwnPropertyDescriptor(Encoder.prototype, prop);
  if (!desc) desc = { enumerable: true, configurable: true };
  if (getter) {
    desc.get = function () {
      return binding[key](this.gfp);
    };
  } else {
    desc.set = function (v) {
      const r = binding[key](this.gfp, v);
      if (LAME_OKAY !== r) {
        throw new Error(`error setting prop "${prop}": ${r}`);
      }
      return r;
    };
  }
  Object.defineProperty(Encoder.prototype, prop, desc);
});


/**
 * Converts a string_with_underscores to camelCase.
 *
 * @param {String} name The name to convert.
 * @return {String} The camel case'd name.
 * @api private
 */

function toCamelCase(name) {
  return name.replace(/(\_[a-zA-Z])/g, $1 => $1.toUpperCase().replace('_', ''));
}
