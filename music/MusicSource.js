const play = require('play-dl');
const ytSearch = require('yt-search');

class MusicSource {
  async search(query) {
    throw new Error('search() must be implemented');
  }

  async getMetadata(url) {
    throw new Error('getMetadata() must be implemented');
  }

  async getAudioStream(url) {
    throw new Error('getAudioStream() must be implemented');
  }
}

class YouTubeSource extends MusicSource {
  /**
   * Search YouTube using yt-search (scrapes YouTube search results page — no internal Browse API dependency)
   */
  async search(query) {
    try {
      const result = await ytSearch(query);
      const videos = result && result.videos ? result.videos : [];
      if (videos.length === 0) return [];

      return videos.slice(0, 10).map(v => ({
        title: v.title || 'Unknown Title',
        artist: v.author ? v.author.name : 'Unknown Artist',
        url: v.url,
        duration: v.seconds || 0,
        thumbnail: v.thumbnail || null,
        source: 'youtube'
      }));
    } catch (err) {
      console.error('[YouTubeSource Search Error]', err.message);
      throw err;
    }
  }

  /**
   * Get metadata from a YouTube URL using play-dl (reliable for direct URLs)
   */
  async getMetadata(url) {
    try {
      const isValid = play.yt_validate(url);
      if (isValid === 'video') {
        const info = await play.video_info(url);
        const details = info.video_details;
        return [{
          title: details.title || 'Unknown Title',
          artist: details.channel ? details.channel.name : 'Unknown Artist',
          url: details.url,
          duration: details.durationInSec || 0,
          thumbnail: details.thumbnails && details.thumbnails[0] ? details.thumbnails[0].url : null,
          source: 'youtube'
        }];
      } else if (isValid === 'playlist') {
        const playlist = await play.playlist_info(url, { incomplete: true });
        const videos = await playlist.all_videos();
        return videos
          .filter(v => v && v.url)
          .map(details => ({
            title: details.title || 'Unknown Title',
            artist: details.channel ? details.channel.name : 'Unknown Artist',
            url: details.url,
            duration: details.durationInSec || 0,
            thumbnail: details.thumbnails && details.thumbnails[0] ? details.thumbnails[0].url : null,
            source: 'youtube'
          }));
      }

      // Fallback: treat as a search query if URL validation failed
      console.warn('[YouTubeSource] URL tidak valid, mencoba sebagai search query...');
      return await this.search(url);
    } catch (err) {
      console.error('[YouTubeSource Metadata Error]', err.message);
      throw err;
    }
  }

  /**
   * Get audio stream from a YouTube URL using play-dl
   */
  async getAudioStream(url) {
    try {
      const stream = await play.stream(url);
      return stream;
    } catch (err) {
      console.error('[YouTubeSource AudioStream Error]', err.message);
      throw err;
    }
  }
}

module.exports = {
  MusicSource,
  YouTubeSource,
  defaultSource: new YouTubeSource()
};
