import { AudioPlayer, AudioPlayerState, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
import fetch, { Headers } from 'node-fetch';
import events from 'events';
import { autocompleteAPIResponse, autocompleteAPIResponseArray, NowPlaying, PlaylistAPIResponse, reco2APIResponse, Station } from './util/interfaces';
import { SpliceMetadata } from './util/SpliceMetadata';
import RadiYo from './RadiYo';
import logger from './util/logger';
import * as https from 'https';


export class RadioPlayer extends events.EventEmitter {
    public NOW_PLAYING: NowPlaying = {} as NowPlaying;
    public CURRENT_STATION: Station = {} as Station;
    public PLAYER: AudioPlayer;
    constructor() {
        super();
        this.PLAYER = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Stop,
            },
        });
        this.PLAYER.on('error', (error) => { logger.error(error.message); });
        this.PLAYER.on<'stateChange'>('stateChange', this.stateHandler);
        this.PLAYER.on('unsubscribe', () => {
            logger.debug('A VoiceConnection unsubscribed from a player');
            logger.debug('Current subscribers: ', this.listenerCount('metadataChange'));
            if (this.listenerCount('metadataChange') == 0) {
                this.PLAYER.stop();
                RadiYo.deleteRadioPlayer(this.CURRENT_STATION);
            }
        });
    }

    public async play(station: Station): Promise<void> {
        let audioStream;
        try {
            if (station.streamDownloadURL.substring(0, 4) === 'https') {
                audioStream = await fetch(station.streamDownloadURL, { headers: new Headers({ 'Icy-Metadata': '1' }), agent: new https.Agent({ rejectUnauthorized: false }) });
            }
            else {
                audioStream = await fetch(station.streamDownloadURL, { headers: new Headers({ 'Icy-Metadata': '1' }) });
            }
        }
        catch (err: unknown) {
            logger.error('Error encountered while streaming, trying ffmpeg', JSON.stringify(err));
        }
        if (audioStream && !audioStream.ok) {
            this.emit('error', `There was an error while streaming this station! Please try another station. HTTP ${audioStream.status}`);
            return;
        }
        const metaInt = audioStream?.headers.get('icy-metaint');
        if (!station.id) {
            const title = audioStream?.headers.get('icy-name');
            if (!title) {
                this.emit('error', `This URL doesn't seem to be a stream. The URL must point directly to a MP3 stream`);
            }
            else {
                station.text = title;
            }
        }
        let resource: AudioResource;
        if (audioStream && metaInt) {
            logger.info('Creating audio resource using splice');
            const spliceMetadata = new SpliceMetadata(parseInt(metaInt), this.updateCurrentPlaying.bind(this));
            audioStream.body.pipe(spliceMetadata);
            resource = createAudioResource(spliceMetadata);
        }
        else {
            logger.info('Creating audio resource using ffmpeg');
            resource = createAudioResource(station.streamDownloadURL);
        }
        this.CURRENT_STATION = station;
        this.PLAYER.play(resource);
    }
    private stateHandler(oldState: AudioPlayerState, newState: AudioPlayerState) {
        logger.debug(`State changed from ${oldState.status} to ${newState.status}`);
        if (this.listenerCount('metadataChange') !== 0 && oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
            logger.info('Stream went to idle from playing with > 0 subscribers, restarting stream.');
            this.play(this.CURRENT_STATION);
        }
    }
    private async getAlbumArt(search: NowPlaying): Promise<NowPlaying> {
        const searchString: string = encodeURIComponent(`${search.artist} ${search.title}`);
        const searchResult = await fetch(`https://itunes.apple.com/search?term=${searchString}`);
        const result = await searchResult.json();
        search.albumArtUrl = result.results[0]?.artworkUrl100 ? result.results[0].artworkUrl100 : '';
        return search;
    }
    private async updateCurrentPlaying(song: NowPlaying | string): Promise<void> {
        if (typeof song !== 'string') {
            song = await this.getAlbumArt(song);
        }
        this.emit('metadataChange', song);
    }

    /*     private static async oldSearch(query: string): Promise<Station> {
        //TODO: This section could do with some better error handling
        let chosenStation: Station = {} as Station;
        const staticSearch = STATIC_STATIONS.find((station) => {
            return station.text.toLowerCase().replace(/\s/g, '') === query.toLowerCase().replace(/\s/g, '');
        });
        if(staticSearch) {
            return staticSearch as Station;
        }
        const searchResultRaw = await fetch(`https://opml.radiotime.com/Search.ashx?query=${query}`);
        const searchResultsText = await searchResultRaw.text();
        const searchResult = xmlParse.parse(searchResultsText, {ignoreAttributes: false, attributeNamePrefix: ''})['opml'];
        if(searchResult.head.status === 200) {
            for(let i = 0; i < searchResult.body.outline.length; i++) {
                const result = searchResult.body.outline[i];
                if(result.type === 'audio' && result.item === 'station') {
                    chosenStation = result;
                    break;
                }
            }
        }
        //Search results return a m3u file, which is a
        //playlist text file with each new line being a
        //potential stream URL or another m3u file (inception)
        const m3uResponse = await fetch(chosenStation.URL);
        let m3uText: string = await m3uResponse.text();
        m3uText = m3uText.trimEnd();
        const potentialStreams: string[] = m3uText.split('\n');
        for(let i = 0; i < potentialStreams.length; i++) {
            const stream: string = potentialStreams[i];
            const fileExt = stream.substring(stream.length - 3);
            if(fileExt !== '.m3u' && fileExt !== 'pls') {
                //TODO: Handle m3u inceptions and making sure a quality stream is chosen (maybe?)
                chosenStation.streamDownloadURL = stream;
                break;
            }
        }
        return chosenStation;
    } */
    static async search(query: string, limit: number | null = null, category: 'ARTIST' | 'STATION' | 'GENRE' | null = null): Promise<Station[] | null> {
        const stations: Station[] = [];

        /*         const staticSearch = STATIC_STATIONS.find((station) => {
            return station.text.toLowerCase().replace(/\s/g, '') === query.toLowerCase().replace(/\s/g, '');
        });
        if(staticSearch) {
            return staticSearch as Station;
        } */
        if (category === 'STATION') {
            query = '@callsign%20' + encodeURIComponent(query) + '*';
        }
        else if (category === 'ARTIST') {
            query = '@artist%20' + encodeURIComponent(query) + '*';
        }
        else if (category === 'GENRE') {
            query = '@genre%20' + encodeURIComponent(query) + '*';
        }
        const playlistResults = await (await fetch(`http://api.dar.fm/playlist.php?callback=json${limit ? `&pagesize=${limit}` : ''}&q=${query}%20&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json() as PlaylistAPIResponse;
        if (playlistResults.success) {
            const results = playlistResults.result.filter((el) => {
                return el.band === 'NET' || el.band === 'FM' || el.band === 'AM';
            });
            for (const result of results) {
                const station: Station = {} as Station;
                station.id = result.station_id;
                station.text = result.callsign;
                //const streamingURLResult = await(await fetch(`http://api.dar.fm/uberstationurl.php?callback=json&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}&station_id=${stationId}`)).json();
                station.streamDownloadURL = `http://stream.dar.fm/${station.id}`;
                const stationInfoResult = await (await fetch(`http://api.dar.fm/darstations.php?callback=json&station_id=${station.id}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json();
                const stationInfo = stationInfoResult.result[0].stations[0];
                station.image = stationInfo.station_image;
                station.subtext = stationInfo.slogan ? stationInfo.slogan : stationInfo.description;
                station.genre = stationInfo.genre;
                station.nowPlaying = { title: '', artist: '' };
                station.nowPlaying.title = result.title;
                station.nowPlaying.artist = result.artist;
                stations.push(station);
            }
            return stations;
        }
        else {
            return null;
        }
    }
    static async searchByStationId(stationId: string): Promise<Station> {
        const station: Station = {} as Station;
        station.streamDownloadURL = `http://stream.dar.fm/${stationId}`;
        const stationInfoResult = await (await fetch(`http://api.dar.fm/darstations.php?callback=json&station_id=${stationId}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json();
        const stationInfo = stationInfoResult.result[0].stations[0];
        station.nowPlaying = { title: '', artist: '' };
        station.id = stationId;
        station.text = stationInfo.callsign;
        station.image = stationInfo.station_image;
        station.subtext = stationInfo.slogan ? stationInfo.slogan : stationInfo.description;
        station.genre = stationInfo.genre;
        station.nowPlaying.title = stationInfo.songtitle;
        station.nowPlaying.artist = stationInfo.songartist;
        return station;
    }
    static async recommendStations(artist: string, limit: number | null = 5, getStationInfo = false): Promise<Station[] | null> {
        const stations: Station[] = [];
        let counter = 0;
        const playlistResults = await (await fetch(`http://api.dar.fm/reco2.php?callback=json&artist=^${encodeURIComponent(artist)}*&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json() as reco2APIResponse;
        if (playlistResults.success) {
            for (const result of playlistResults.result) {
                if (limit && counter >= limit) break;
                const station: Station = {} as Station;
                station.nowPlaying = { title: '', artist: '' };
                station.id = result.playlist.station_id;
                station.text = result.playlist.callsign;
                station.streamDownloadURL = `http://stream.dar.fm/${station.id}`;
                station.nowPlaying.title = result.songtitle;
                station.nowPlaying.artist = result.songartist;
                if (getStationInfo) {
                    const stationInfoResult = await (await fetch(`http://api.dar.fm/darstations.php?callback=json&station_id=${station.id}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json();
                    const stationInfo = stationInfoResult.result[0].stations[0];
                    station.image = stationInfo.station_image;
                    station.subtext = stationInfo.slogan ? stationInfo.slogan : stationInfo.description;
                    station.genre = stationInfo.genre;
                }
                stations.push(station);
                counter++;
            }
            return stations;
        }
        else {
            return null;
        }
    }
    static async searchByArtist(artist: string, limit = 5): Promise<Station[] | null> {
        const search = await this.search(artist, limit, 'ARTIST');
        if (search) {
            if (search.length < limit) {
                let result;
                const remainingSlots = limit - search.length;
                const recStations = await this.recommendStations(artist, remainingSlots);
                if (recStations) {
                    result = search.concat(recStations);
                    return result;
                }
            }
            else {
                return search;
            }
        }
        else {
            const recStations = await this.recommendStations(artist, 5);
            return recStations;
        }
        return null;
    }
    static async searchByStation(query: string, limit = 5): Promise<Station[] | null> {
        const search = await this.search(query, limit, 'STATION');
        if (search) {
            return search;
        }
        else {
            return null;
        }
    }
    static async searchByGenre(genre: string, limit = 5): Promise<Station[] | null> {
        const search = await this.search(genre, limit, 'GENRE');
        if (search) {
            return search;
        }
        else {
            return null;
        }
    }
    static async searchOne(query: string): Promise<Station | null> {
        const search = await RadioPlayer.search(query, 2);
        if (search) {
            return search[0];
        }
        else {
            return null;
        }
    }
    static async getTopSongs(): Promise<Station[] | null> {
        const stations: Station[] = [];
        const playlistResults = await (await fetch(`http://api.dar.fm/topsongs.php?callback=json&q=Music&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json() as reco2APIResponse;
        if (playlistResults.success) {
            const random = playlistResults.result.sort(() => .5 - Math.random()).slice(0, 5);
            for (const result of random) {
                const station: Station = {} as Station;
                station.nowPlaying = { title: '', artist: '' };
                station.id = result.playlist.station_id;
                station.text = result.playlist.callsign;
                station.nowPlaying.title = result.songtitle;
                station.nowPlaying.artist = result.songartist;
                stations.push(station);
            }
            return stations;
        }
        else {
            return null;
        }
    }
    static async getAutocomplete(query: string): Promise<autocompleteAPIResponseArray[] | null> {
        if (query) {
            const response = await (await fetch(`http://api.dar.fm/presearch.php?callback=json&q=${query}*&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json() as autocompleteAPIResponse;
            return response.result;
        }
        return null;
    }
}