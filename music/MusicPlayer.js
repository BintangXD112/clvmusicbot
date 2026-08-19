const EventEmitter = require('events');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');

class MusicPlayer extends EventEmitter {
  constructor() {
    super();
    this.player = createAudioPlayer();
    const defaultVol = parseInt(process.env.DEFAULT_VOLUME, 10);
    this.volume = isNaN(defaultVol) ? 1.0 : (Math.max(0, Math.min(100, defaultVol)) / 100.0);
    this.resource = null;

    // Guard flag: when true, suppress the next Idle event so we don't
    // fire trackEnd in the middle of deliberately switching tracks.
    this._switchingTrack = false;
    
    this.setupListeners();
  }

  setupListeners() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      // If we are switching tracks intentionally, ignore this transient Idle event
      if (this._switchingTrack) {
        this._switchingTrack = false;
        return;
      }
      this.emit('trackEnd');
    });

    this.player.on('error', (error) => {
      this._switchingTrack = false;
      this.emit('error', error);
    });
  }

  playStream(audioStream) {
    // Raise the guard before calling play() to swallow any transitional Idle event
    this._switchingTrack = true;

    // audioStream is expected to be { stream, type } from play-dl
    this.resource = createAudioResource(audioStream.stream, {
      inputType: audioStream.type,
      inlineVolume: true
    });

    this.resource.volume.setVolume(this.volume);
    this.player.play(this.resource);

    // Lower the guard once the player is no longer Idle (moved to Buffering/Playing)
    // Use a one-time listener on the next non-Idle transition to reset the guard
    const onActive = (oldState, newState) => {
      if (newState.status !== AudioPlayerStatus.Idle) {
        this._switchingTrack = false;
        this.player.off('stateChange', onActive);
      }
    };
    this.player.on('stateChange', onActive);
  }

  pause() {
    return this.player.pause();
  }

  resume() {
    return this.player.unpause();
  }

  stop() {
    // Raise guard before stopping so the Idle event from stop() is suppressed
    this._switchingTrack = true;
    this.player.stop(true);
    this.resource = null;
    // Lower the guard after a tick so subsequent natural trackEnd still fires
    setImmediate(() => { this._switchingTrack = false; });
  }

  setVolume(volumePercent) {
    // Clamp between 0 and 100
    const val = Math.max(0, Math.min(100, volumePercent));
    this.volume = val / 100.0;
    if (this.resource && this.resource.volume) {
      this.resource.volume.setVolume(this.volume);
    }
    return val;
  }

  getVolumePercent() {
    return Math.round(this.volume * 100);
  }

  isPaused() {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  isPlaying() {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  getStatus() {
    return this.player.state.status;
  }
}

module.exports = MusicPlayer;
