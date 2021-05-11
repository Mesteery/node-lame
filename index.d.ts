declare module '@mestery/lame' {
    import { Transform, TransformOptions } from 'stream';

    /*
     * Channel Modes
     */
    export const STEREO: 0;
    export const JOINTSTEREO: 1;
    export const DUALCHANNEL: 2;
    export const MONO: 3;

    export interface DecoderOptions extends TransformOptions {
        readonly decoder?: string;
    }

    export interface EncoderOptions extends TransformOptions {
        readonly float?: boolean;
        readonly signed?: number;
        readonly bitDepth?: number;
        readonly channels?: number;
        readonly sampleRate?: number;
        readonly bitRate?: number;
        readonly outSampleRate?: number;
        readonly mode?: typeof STEREO | typeof JOINTSTEREO | typeof DUALCHANNEL | typeof MONO;
    }

    /**
     * The `Decoder` accepts an MP3 file and outputs raw PCM data.
     * 
     * @param options Configurations.
     * @returns A transform stream.
     */
    export class Decoder extends Transform {
        constructor(options: DecoderOptions)
    }

    /**
     * The `Encoder` accepts raw PCM data and outputs an MP3 file.
     * 
     * @param options Configurations.
     * @returns A transform stream.
     */
    export class Encoder extends Transform {
        constructor(options: EncoderOptions)
    }
}
