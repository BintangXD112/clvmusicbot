class MusicQueue {
  constructor() {
    this.songs = [];
    this.currentIndex = -1;
    this.loopMode = 'off'; // 'off' | 'track' | 'queue'
    this.shuffle = false;
  }

  add(song) {
    if (Array.isArray(song)) {
      this.songs.push(...song);
    } else {
      this.songs.push(song);
    }
  }

  getCurrentSong() {
    if (this.currentIndex >= 0 && this.currentIndex < this.songs.length) {
      return this.songs[this.currentIndex];
    }
    return null;
  }

  getPreviousSong() {
    if (this.currentIndex > 0 && this.songs.length > 0) {
      return this.songs[this.currentIndex - 1];
    }
    return null;
  }

  next() {
    if (this.songs.length === 0) return null;

    if (this.loopMode === 'track') {
      // Keep same index
      return this.getCurrentSong();
    }

    if (this.loopMode === 'queue') {
      this.currentIndex = (this.currentIndex + 1) % this.songs.length;
      return this.getCurrentSong();
    }

    // Default 'off'
    if (this.currentIndex < this.songs.length - 1) {
      this.currentIndex++;
      return this.getCurrentSong();
    }

    // End of queue
    this.currentIndex = this.songs.length; // move past end
    return null;
  }

  prev() {
    if (this.songs.length === 0) return null;

    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.getCurrentSong();
    }
    return null;
  }

  clear() {
    this.songs = [];
    this.currentIndex = -1;
    this.loopMode = 'off';
    this.shuffle = false;
  }

  isEmpty() {
    return this.songs.length === 0 || this.currentIndex >= this.songs.length;
  }

  toggleLoop() {
    if (this.loopMode === 'off') {
      this.loopMode = 'track';
    } else if (this.loopMode === 'track') {
      this.loopMode = 'queue';
    } else {
      this.loopMode = 'off';
    }
    return this.loopMode;
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this.shuffle && this.songs.length > this.currentIndex + 1) {
      // Shuffle only the upcoming songs
      const current = this.songs.slice(0, this.currentIndex + 1);
      const upcoming = this.songs.slice(this.currentIndex + 1);
      
      // Fisher-Yates shuffle
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      
      this.songs = current.concat(upcoming);
    }
    return this.shuffle;
  }

  remove(index) {
    if (index >= 0 && index < this.songs.length) {
      const removed = this.songs.splice(index, 1)[0];
      if (index <= this.currentIndex && this.currentIndex > -1) {
        this.currentIndex--;
      }
      return removed;
    }
    return null;
  }
}

module.exports = MusicQueue;
