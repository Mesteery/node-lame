
/**
 * The `Decoder` accepts an MP3 file and outputs raw PCM data.
 */
export * from './lib/decoder.js';

/**
 * The `Encoder` accepts raw PCM data and outputs an MP3 file.
 */
export * from './lib/encoder.js';

/*
 * Channel Modes
 */
export const STEREO = 0;
export const JOINTSTEREO = 1;
export const DUALCHANNEL = 2;
export const MONO = 3;
