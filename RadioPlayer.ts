import { AudioPlayer, AudioResource, createAudioPlayer, createAudioResource, NoSubscriberBehavior } from '@discordjs/voice';
//import xmlParse from 'fast-xml-parser';
import fetch, { Headers } from 'node-fetch';
import events from 'events';
import URL from 'url';
//import STATIC_STATIONS from './static_stations.json';
import { NowPlaying, PlaylistAPIResponse, Station } from './util/interfaces';
import { SpliceMetadata } from './util/SpliceMetadata';
import RadiYo from './RadiYo';

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
    }

    public async play(station: Station): Promise<void> {
        const streamDownloadURL = new URL.URL(station.streamDownloadURL);
        if(streamDownloadURL.protocol === 'https:') {
            streamDownloadURL.protocol = 'http:';
        }
        const audioStream = await fetch(streamDownloadURL, {headers: new Headers({'Icy-Metadata': '1'})});
        if(!audioStream.ok) {
            this.emit('error', `There was an error while streaming this station! HTTP ${audioStream.status}`);
        }
        const metaInt = audioStream.headers.get('icy-metaint');
        let resource: AudioResource;
        if(metaInt) {
            const spliceMetadata = new SpliceMetadata(parseInt(metaInt), this.updateCurrentPlaying.bind(this));
            audioStream.body.pipe(spliceMetadata);
            spliceMetadata.on('close', () => console.log('Stream was closed'));
            spliceMetadata.on('end', () => console.log('Stream was ended'));
            spliceMetadata.on('error', () => console.log('Stream was error'));
            resource = createAudioResource(spliceMetadata);
        }
        else {
            resource = createAudioResource(station.streamDownloadURL);
        }
        this.PLAYER.play(resource);
        //this.PLAYER.on('error', err => { this.emit('error', err); });
        this.PLAYER.on('error', (error) => {console.error(error.message);});
        this.PLAYER.on('stateChange', (oldState, newState)  => {console.debug(`State changed for ${station.text} from ${oldState.status} to ${newState.status}`);});
        this.PLAYER.on('unsubscribe', () => {
            console.debug('A VoiceConnection unsubscribed from a player');
            console.debug('Current subscribers: ', this.listenerCount('metadataChange')); 
            if(this.listenerCount('metadataChange') == 0) {
                this.PLAYER.stop();
                RadiYo.deleteRadioPlayer(station);
            }
        });
    }
    private async getAlbumArt(search: NowPlaying): Promise<NowPlaying> {
        const searchString: string = encodeURIComponent(`${search.artist} ${search.title}`);
        const searchResult = await fetch(`https://itunes.apple.com/search?term=${searchString}`);
        const result = await searchResult.json();
        search.albumArtUrl = result.results[0]?.artworkUrl100 ? result.results[0].artworkUrl100 : '';
        return search;
    }
    private async updateCurrentPlaying(song: NowPlaying | string): Promise<void> {
        if(typeof song !== 'string') {
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
    static async search(query: string, limit : number | null = null): Promise<Station[] | null> {
        const stations: Station[] = [];
        
        /*         const staticSearch = STATIC_STATIONS.find((station) => {
            return station.text.toLowerCase().replace(/\s/g, '') === query.toLowerCase().replace(/\s/g, '');
        });
        if(staticSearch) {
            return staticSearch as Station;
        } */
        const playlistResults = await(await fetch(`http://api.dar.fm/playlist.php?callback=json${limit ? `&pagesize=${limit}` : ''}&q=${encodeURIComponent(query)}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json() as PlaylistAPIResponse;
        if(playlistResults.success) {
            const results = playlistResults.result.filter((el) => {
                return el.band === 'NET' || el.band === 'FM' || el.band === 'AM';
            });
            for(const result of results){
                const station: Station = {} as Station;
                station.id = result.station_id;
                station.text = result.callsign;
                //const streamingURLResult = await(await fetch(`http://api.dar.fm/uberstationurl.php?callback=json&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}&station_id=${stationId}`)).json();
                station.streamDownloadURL = `http://stream.dar.fm/${station.id}`;
                const stationInfoResult = await(await fetch(`http://api.dar.fm/darstations.php?callback=json&station_id=${station.id}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json();
                const stationInfo = stationInfoResult.result[0].stations[0];
                station.image = stationInfo.station_image;
                station.subtext = stationInfo.slogan ? stationInfo.slogan : stationInfo.description;
                station.genre = stationInfo.genre;
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
        const stationInfoResult = await(await fetch(`http://api.dar.fm/darstations.php?callback=json&station_id=${stationId}&partner_token=${RadiYo.RADIO_DIRECTORY_KEY}`)).json();
        const stationInfo = stationInfoResult.result[0].stations[0];
        station.id = stationId;
        station.text = stationInfo.callsign;
        station.image = stationInfo.station_image;
        station.subtext = stationInfo.slogan ? stationInfo.slogan : stationInfo.description;
        station.genre = stationInfo.genre;
        return station;
    }
    static async searchOne(query: string): Promise<Station | null> {
        const search = await RadioPlayer.search(query, 2);
        if(search) {
            return search[0];
        }
        else {
            return null;
        }
    }
}