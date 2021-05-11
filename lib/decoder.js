
/**
 * Module dependencies.
 */

import assert from 'assert';
import { Transform } from 'stream';
import binding from './bindings.js';


/**
 * Some constants.
 */
const MPG123_OK = binding.MPG123_OK;
const MPG123_DONE = binding.MPG123_DONE;
const MPG123_NEW_ID3 = binding.MPG123_NEW_ID3;
const MPG123_NEED_MORE = binding.MPG123_NEED_MORE;
const MPG123_NEW_FORMAT = binding.MPG123_NEW_FORMAT;

/**
 * One-time calls...
 */

binding.mpg123_init();
process.once('exit', binding.mpg123_exit);

/**
 * The recommended size of the "output" buffer when calling mpg123_read().
 */
const safeBuffer = binding.mpg123_safe_buffer();

/**
 * `Decoder` Stream class.
 *  Accepts an MP3 file and spits out raw PCM data.
 */
export class Decoder extends Transform {
  constructor(options) {
    super(options);

    const ret = binding.mpg123_new(options ? options.decoder : null);
    if (Buffer.isBuffer(ret)) {
      this.mh = ret;
    } else {
      throw new Error(`mpg123_new() failed: ${ret}`);
    }

    const feed = binding.mpg123_open_feed(this.mh);
    if (MPG123_OK !== feed) {
      throw new Error(`mpg123_open_feed() failed: ${feed}`);
    }
  }

  /**
   * Calls `mpg123_feed()` with the given "chunk", and then calls `mpg123_read()`
   * until MPG123_NEED_MORE is returned.
   *
   * @param {Buffer} chunk The Buffer instance of PCM audio data to process
   * @param {String} encoding ignore...
   * @param {Function} done callback function when done processing
   * @api private
   */

  _transform(chunk, _encoding, done) {
    let out;
    binding.mpg123_feed(this.mh, chunk, chunk.length, (ret) => {
      if (MPG123_OK === ret) {
        return read();
      }
      done(new Error(`mpg123_feed() failed: ${ret}`));
    });

    const read = () => {
      out = Buffer.alloc(safeBuffer);
      binding.mpg123_read(this.mh, out, out.length, (ret, bytes, meta) => {
        if (meta & MPG123_NEW_ID3 !== 0) {
          return handleRead(ret, bytes);
        }

        binding.mpg123_id3(this.mh, (ret2, id3) => {
          if (ret2 === MPG123_OK) {
            this.emit(`id3v${id3?.tag ? 1 : 2}`, id3);
            return handleRead(ret, bytes);
          }
          // error getting ID3 tag info (probably shouldn't happen)...
          done(new Error(`mpg123_id3() failed: ${ret2}`));
        });
      });
      // XXX: the `afterRead` function below holds the reference to the "out"
      // buffer while being filled by `mpg123_read()` on the thread pool.
    }

    const handleRead = (ret, bytes) => {
      if (bytes > 0) {
        // got decoded data
        assert(out.length >= bytes);
        this.push(out.slice(0, bytes));
      }

      if (ret === MPG123_DONE || ret === MPG123_NEED_MORE) {
        return done();
      }
      if (ret === MPG123_NEW_FORMAT) {
        const format = binding.mpg123_getformat(this.mh);
        this.emit('format', format);
        return read();
      }
      if (MPG123_OK !== ret) {
        return done(new Error(`mpg123_read() failed: ${ret}`));
      }
      read();
    }
  }
}
