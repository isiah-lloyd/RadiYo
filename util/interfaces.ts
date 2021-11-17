export interface NowPlaying {
    title: string;
    artist: string;
    albumArtUrl: string;
}
export interface Station {
    id: string;
    image: string;
    subtext: string;
    //title of station
    text: string;
    streamDownloadURL: string,
    //link to m3u file
    URL: string,
    genre: string
}

export interface FeaturedStation {
    title: string;
    description: string;
    stations: Station[];
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
