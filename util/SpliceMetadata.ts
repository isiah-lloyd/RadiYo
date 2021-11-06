import { Transform, TransformCallback, TransformOptions } from 'stream';
import { NowPlaying } from './interfaces';

export class SpliceMetadata extends Transform {
        private META_INT : number;
        private byteCounter = 0;
        private iterator = 0;
        private tempBuffer = '';
        private updateFn: (song: NowPlaying | string) => void;
        constructor(META_INT: number, fn: (song: NowPlaying | string) => void, opts?: TransformOptions) {
            super({ ...opts});
            this.META_INT = META_INT;
            this.updateFn = fn;
        }
        /**
         * Metadata comes in this format " StreamTitle='Artist - Song';"
         * This function splits the song and artist into a readable format
         * @param raw Metadata coming straight from the buffer 
         */
        private extractSongTitle(raw: string): NowPlaying | string | null {
            console.log(raw);
            const np: NowPlaying = {} as NowPlaying;
            const rawProc : string = raw.split('StreamTitle=\'')[1].split('\';')[0];
            if(rawProc.includes('adContext=')) {
                return 'Advertisement';
            }
            if(rawProc.includes('song_spot')) {
                // we are in iheartmedia land :(
                const split = rawProc.split(' - text="');
                np.artist = split[0];
                np.title = split[1].split('"')[0];
                return np;
            }
            const numOfDash = rawProc.replace(/[^-]/g, '').length;
            // If there's more than one dash, we don't know if its part of the song title
            // or splitting the artist and song, so lets just return a string and be easy 
            if (numOfDash == 1) {
                const splitData = rawProc.split('-');
                np.title = splitData[1].trim();
                np.artist = splitData[0].trim();
                return np;
            }
            else if(rawProc !== '') {
                return rawProc;
            }
            else {
                return null;
            }
        }
        _transform(chunk: Buffer, _: BufferEncoding, callback: TransformCallback): void {
            const hexArray = chunk.toString('hex').match(/.{2}/g);
            let filteredChunk = ''; 
            chunk.forEach((byte, index) => {
                if(this.byteCounter === this.META_INT) {
                    this.byteCounter = 0;
                    this.iterator = byte * 16;
                }
                else if(this.iterator > 0) {
                    this.iterator--;
                    if(byte !== 0) {
                        this.tempBuffer += String.fromCharCode(byte);
                    }
                    if(this.iterator === 0) {
                        const songTitle = this.extractSongTitle(this.tempBuffer);
                        if(songTitle) { this.updateFn(songTitle); } 
                        this.tempBuffer = '';
                    }
                }
                else {
                    if(hexArray) {
                        filteredChunk += hexArray[index];
                        this.byteCounter++;
                    }
                }
            });
            this.push(Buffer.from(filteredChunk, 'hex'));
            callback();
        }
}