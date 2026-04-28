/**
 * Song parser — maps ccMixter API responses to/from internal Song objects.
 *
 * @module song-parser
 */

/**
 * Extract the license slug from a license_logo_url.
 * e.g. "http://i.creativecommons.org/l/by-nc/3.0/88x31.png" → "by-nc"
 *
 * Takes the filename after the last "/", strips the extension,
 * then removes the prefix up to and including the first "-" after "cc".
 * If the URL doesn't follow the expected pattern, returns the
 * filename without extension as a fallback.
 */
function extractLicenseSlug(logoUrl) {
  if (!logoUrl) return '';
  const filename = logoUrl.substring(logoUrl.lastIndexOf('/') + 1, logoUrl.lastIndexOf('.'));
  // Strip everything up to and including the first "-" (handles "cc-by-nc-3" → "by-nc-3" etc.)
  const dashIndex = filename.indexOf('-');
  if (dashIndex === -1) return filename;
  const afterPrefix = filename.substring(dashIndex + 1);
  // Remove trailing version number like "-3" or "-3.0" at the end
  // The slug is everything before the last "-" followed by a digit
  const versionMatch = afterPrefix.match(/^(.+)-\d+$/);
  return versionMatch ? versionMatch[1] : afterPrefix;
}

/**
 * Parse a raw API response object into an internal Song object.
 *
 * Returns `null` if the response has no `audio-mp3-mp3` file entry.
 *
 * @param {object} raw - A single item from the ccMixter API JSON response.
 * @returns {object|null} Song object or null.
 */
export function parseSongFromAPI(raw) {
  if (!raw || !raw.files) return null;

  // Find the first audio-mp3-mp3 file
  const mp3File = raw.files.find(
    (f) => f.file_format_info && f.file_format_info['format-name'] === 'audio-mp3-mp3'
  );

  if (!mp3File) return null;

  const tags = raw.upload_tags || '';

  return {
    id: raw.upload_id,
    title: raw.upload_name,
    author: raw.user_real_name,
    url: raw.file_page_url,
    downloadLink: mp3File.download_url,
    licenceLink: raw.license_url,
    tags,
    file_name: mp3File.file_name,
    size: mp3File.file_rawsize,
    license: extractLicenseSlug(raw.license_logo_url),
    licenseName: raw.license_name,
    isFavourite: false,
    wasFavourite: false,
    isPlaying: false,
    isPlayed: false,
    isSkipped: false,
    isEdPick: tags.includes('editorial_pick'),
  };
}


/**
 * Serialize a Song object back to a JSON structure compatible with the
 * ccMixter API response format. Used for round-trip testing.
 *
 * @param {object} song - Internal Song object.
 * @returns {object} API-compatible raw response object.
 */
export function songToAPIFormat(song) {
  return {
    upload_id: song.id,
    upload_name: song.title,
    user_real_name: song.author,
    file_page_url: song.url,
    license_url: song.licenceLink,
    upload_tags: song.tags,
    license_logo_url: `https://i.creativecommons.org/l/cc-${song.license}-3.png`,
    license_name: song.licenseName,
    files: [
      {
        file_format_info: { 'format-name': 'audio-mp3-mp3' },
        download_url: song.downloadLink,
        file_name: song.file_name,
        file_rawsize: song.size,
      },
    ],
  };
}
