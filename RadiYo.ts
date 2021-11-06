import { Guild, TextBasedChannels, VoiceChannel } from 'discord.js';
import 'dotenv/config';
import { RadioPlayer } from './RadioPlayer';
import { Station } from './util/interfaces';
import { VoiceManager } from './VoiceManager';

class RadiYo {
    readonly DISCORD_TOKEN : string = this.getEnv('DISCORD_TOKEN');
    readonly DISCORD_OAUTH_CLIENT_ID : string = this.getEnv('DISCORD_OAUTH_CLIENT_ID');
    readonly DISCORD_GUILD_ID : string = this.getEnv('DISCORD_GUILD_ID');
    readonly RADIO_DIRECTORY_KEY: string = this.getEnv('RADIO_DIRECTORY_KEY'); 

    private VOICE_MANAGERS: Map<string, VoiceManager> = new Map();
    public RADIO_PLAYERS: Map<string, RadioPlayer> = new Map();

    private getEnv(envVar: string): string {
        const p = process.env[envVar];
        if(p !== undefined){
            return p;
        }
        else {
            throw new ReferenceError(`Environment Variable {${envVar}} is not defined.`);
        }
    }
    public getVoiceManager(guild: Guild): VoiceManager | null {
        const player = this.VOICE_MANAGERS.get(guild.id);
        if(player) return player; else return null;
    }
    public createVoiceManager(guild: Guild, notificationChannel: TextBasedChannels, voiceChannel: VoiceChannel) : VoiceManager {
        const rs = this.getVoiceManager(guild);
        if(rs) {
            return rs;
        }
        else {
            const newVm = new VoiceManager(guild, notificationChannel, voiceChannel);
            this.VOICE_MANAGERS.set(guild.id, newVm);
            console.debug(`There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);   
            return newVm;
        }
    }
    public deleteVoiceManager(guildId: string): boolean {
        const v = this.VOICE_MANAGERS.delete(guildId);
        console.debug(`There are currently ${this.VOICE_MANAGERS.size} voice managers in memory`);   
        return v;
    }
    public getRadioPlayer(station: Station): RadioPlayer {
        let rp = this.RADIO_PLAYERS.get(station.streamDownloadURL);
        if(!rp) {
            rp = new RadioPlayer();
            rp.play(station);
            this.RADIO_PLAYERS.set(station.streamDownloadURL, rp);
        }
        console.debug(`There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);   
        return rp;
    }
    public deleteRadioPlayer(station: Station): boolean {
        //TODO: Actually implement this
        const v = this.RADIO_PLAYERS.delete(station.streamDownloadURL);
        console.debug(`There are currently ${this.RADIO_PLAYERS.size} radio players in memory`);   
        return v;
    }
}

export default new RadiYo();