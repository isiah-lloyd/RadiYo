export interface NowPlaying {
    title: string;
    artist: string;
    albumArtUrl: string;
}
export interface Station {
    image: string;
    subtext: string;
    //title of station
    text: string;
    streamDownloadURL: string,
    //link to m3u file
    URL: string,
    genre: string
}

// API responses
interface PlaylistAPIResponseArray {
    callsign: string;
    station_id: string;
    band: string;
}
export interface PlaylistAPIResponse {
    success: boolean;
    result: PlaylistAPIResponseArray[]
}