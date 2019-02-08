var current;
var currentSong;
var position = null;
var wrapper;
var basePath;
var resultSize;
var limit = 25;

var auto_download;
var auto_download_wlan_only;

var ft;
var download_id;

var playing;
var lastUpdate = 0;

var audio;

var playWhenReady = false;

var playlistId = -1;

var favourites = [];

var user = null;

var password = null;

var storage_size;

var fav_autoplay = false;
var fav_download = false;
var show_all_songs = false;
var show_former_favourites = false;
var edPicks_only = false;

var edPickCount = 0;

var normalSongCount = 0;

var db;

var newestLoadedSong;

var cacheSize = -1;

var initialStart;

function onDeviceReady()
{
	console.log("onDeviceReady");
//	document.addEventListener("online", function() {
//  downloadNewSongs();
//}, false);

  window.HeadsetDetection.registerRemoteEvents(function(status) {
  	switch (status) {
    	case 'headsetRemoved':
				if ((audio != null) && !audio.paused) {
					pauseMedia();
				}
      break;
      }
  });

	window.alert = function(message, title) {
		if (title) {
			title = "Attention please!";
		}
		$('#generic_header').html(title);
		$('#generic_content').html(message);
		$('#generic_dialog').popup('open');
	};
	setup();
}

document.addEventListener("deviceready", onDeviceReady, false);

function resetSpecialPlay() {
 fav_autoplay = false;
 show_all_songs = false;
 show_former_favourites = false;
 edPicks_only = false;
}

function findSongThatMightBeNotDownloaded(id, favOnly, success, error)
{
	console.log("[findSongThatMightBeNotDownloaded] id "+id);
	loadSongWithIdLowerThan(id, favOnly, function(candidate)
	{
		if (candidate.isFavourite ||
			(!fav_download && !candidate.isSkipped))
		{
			debug("[findSongThatMightBeNotDownloaded] candidate:", candidate);
			return success(candidate);
		} else {
			debug("[findSongThatMightBeNotDownloaded] Song was skipped:", candidate);
			findSongThatMightBeNotDownloaded(candidate.id, favOnly, success, error);
		}
	}, error);
}

function online() {
	if (!navigator.connection) {
		console.log("Cannot get connection state.");
		return false;
	}

	var networkState = navigator.connection.type;

	if ((networkState == Connection.NONE) ||
		  (networkState == Connection.UNKNOWN))
	{
		console.log("offline: "+networkState);
		return false;
	} else {
		console.log("online: "+networkState);
		return true;
	}
}

function autoDownloadEnabled() {
	if (!auto_download) {
		console.log("auto download disabled");
		return false;
	}

  if (!auto_download_wlan_only) {
		console.log("auto download enabled");
		return true;
	}

	if (!navigator.connection) {
		console.log("Cannot get connection state.");
		return;
	}

	var networkState = navigator.connection.type;

	if ((networkState == Connection.ETHERNET) ||
		  (networkState == Connection.WIFI))
	{
		console.log("auto_download_wlan_only and network is "+networkState);
		return true;
	} else {
		console.log("auto_download_wlan_only and network is "+networkState);
		return false;
	}
}

function downloadNewSongs(startId) {
	console.log("downloadNewSongs");
  if (!autoDownloadEnabled())
	{
		return;
	}

	if (ft != null) {
		console.log("Found running dl. Not starting another one.");
		return;
	}

	if (startId == null) {
		startId = currentSong.id;
	}

	console.log("startId: "+startId);

	findSongThatMightBeNotDownloaded(startId, fav_download, function(song) {
		console.log("checking if file with id "+song.id+" already downloaded");
		downloadSong(song);
	}, function() {
	  if (!fav_download && !show_former_favourites) {
			console.log("Downloaded all known files. Let's see if there are more.");
			var offset = edPicks_only ? edPickCount : normalSongCount;
			getSongList(offset, function() {
					//the easiest way is to start all over.
					getHighestId(false, function(song) {
						downloadNewSongs(song.id);
					});
			}, function() {
				console.log("No new songs found. Aborting download search.");
				$.mobile.loading('hide');
				return;
			});
    } else {
			console.log("Downloaded all favourites");
			fav_download = false;
			downloadNewSongs();
    }
	});
}

function downloadSong(song)
{
	var abortDownload = false;
	if (ft != null) {
		if ((song.id == currentSong.id) && (song.id != download_id))
		{
			console.log("[downloadSong] Found active FT downloading "+download_id+" but download for current ("+song.id+") is requested.");
			abortDownload = true;
		} else {
			console.log("[downloadSong] Found active FT. Not starting new one.");
			return;
		}
	}
	isSongReadyToPlay(song, function() {
		startPlaying(song);
		downloadNewSongs(song.id-1);
	}, function() {
		startDownload(song, abortDownload);
	});
}

function isSongReadyToPlay(song, isReadyCallback, isNotReadyCallback) {
	var downloadPath = getStorageUrl(song);
	console.log("isSongReadyToPlay checking "+song.title+" path is: "+downloadPath);
	resolveLocalFileSystemURL(downloadPath,
		function(entry) {
			console.log("[downloadSong] Song found on device. Checking file size.");
			entry.file(function(file) {
				console.log("file.size / song.size: "+file.size+" / "+song.size);
				if (file.size < song.size)
				{
					console.log("[downloadSong] File was only partially downloaded.");
					entry.remove(function() {
						console.log("[downloadSong] Deleted partial download");
						isNotReadyCallback(song);
					}, function() {
						alert("[downloadSong] Could not remove partial download!");
						isNotReadyCallback(song);
					});
				} else {
					console.log("[downloadSong] File size matches.");
					isReadyCallback(song);
				}
			});
  	},
		function() {
			console.log("[downloadSong] Song not found at path "+downloadPath);
			isNotReadyCallback(song);
		}
	);
}

function toArray(list) {
  return Array.prototype.slice.call(list || [], 0);
}

function sumFiles(entries, index, sum, callback) {
	if (index < entries.length) {
		console.log("Checking file "+index);
		var entry = entries[index];
		if (!entry.isDirectory)
		{
			entry.file(function(file) {
				console.log(entry.name+" "+file.size);
				loadSongByFilename(entry.name, function(song)
				{
					if (song != null) {
						if (song.isFavourite)
						{
							console.log("Found fav ("+entry.name+"). Not counting");
							isFav = true;
						} else {
							sum += file.size;
							console.log("Sum is now: "+sum);
						}
					} else {
						console.log("Cannot check if "+entry.name+" is a fav");
						sum += file.size;
						console.log("Sum is now: "+sum);
					}
					sumFiles(entries, index+1, sum, callback);
				});
			});
		} else {
			sumFiles(entries, index+1, sum, callback);
		}
	} else {
		callback(sum);
	}
}

function getStoredFiles(callback) {
	var dummy = {};
	dummy.file_name = "";
	resolveLocalFileSystemURL(getStorageUrl(dummy),
		function(entry) {
			console.log("Directory entry: ");
			console.log(entry);
			var directoryReader = entry.createReader();
			var entries = [];
			var readEntries = function() {
				directoryReader.readEntries (function(results) {
					if (!results.length) {
						callback(entries);
					} else {
						entries = entries.concat(toArray(results));
						readEntries();
					}
				});
			};
			readEntries();
		}
	);
}

function startDownload(song, abortDownload)
{
	if ((song.size + cacheSize > storage_size * 1024 * 1024) &&
			(song.id != currentSong.id) && !song.isFavourite)
	{
		console.log("Not enough space in cache for song.");
		return;
	}
	if (abortDownload) {
		console.log("Aborting previous download");
		ft.abort();
	}

	var uri = encodeURI(song.downloadLink);
	if (song.id == currentSong.id) {
		$('.status').addClass("loading");
	}
	ft = new FileTransfer();
	download_id = song.id;
	var downloadPath = getStorageUrl(song);
	console.log("[startDownload] Downloading "+uri+" ("+song.id+") to "+downloadPath);
	ft.download(uri, downloadPath, function(entry) {
		ft = null;
		download_id = null;
		if (song.id == currentSong.id) {
			progress('loading', 0, 'black');
			$('.status').removeClass("loading");
			startPlaying(song);
		}
		console.log(entry);
		if (!song.isFavourite)
		{
			entry.file(function(file) {
				var fileSize = file.size;
				cacheSize += fileSize;
				updateCacheState();
			});
		}
		downloadNewSongs(song.id-1);
	}, function() {
		console.log("Download error");
		ft = null;
		download_id = null;
	});

  var oldProgress = 0;
	ft.onprogress = function(progressEvent) {
		if (progressEvent.lengthComputable) {
			var percent = Math.floor(progressEvent.loaded / progressEvent.total * 100);
			if (oldProgress != percent) {
				console.log('Progress for "'+song.title+'" by '+song.author+': '+percent+'%');
				var newCacheSize = cacheSize + progressEvent.loaded;
				var cachePercent = newCacheSize * 100 / (storage_size * 1024 * 1024);
				if (!song.isFavourite && (cachePercent <= 100)) {
					progress("cache", cachePercent, "darkgrey");
				}
				oldProgress = percent;
				if (song.id == currentSong.id) {
					progress('loading', percent, 'black');
				}
			}
		} else {
			alert("Damn!");
		}
	};
}

function startPlaying(song) {
	if (playWhenReady) {
		var downloadPath = getStorageUrl(song);
		resolveLocalFileSystemURL(downloadPath,
			function(file) {
				var nativePath = file.toURL();
				audio.src = nativePath;
				playMedia();
			}
		);
	}
}

function load(song, offset)
{
	position = page;
	debug("load: ", song);
	var page = wrapper[offset].id;
	currentSong = song;
	var selector = '#' + page;

//	$(selector + " .date").html("Today");

	$('.download').attr('href', song.downloadLink);

	$(selector + ' .license').attr('href', song.licenceLink);

	console.log("Setting title: "+song.title);
	$(selector + ' .title').html(song.title);

	$(selector + ' .author').html(song.author);

//	$(selector + " .date").html('"' + title + '" by ' + author);

	$(selector + ' .tags').html("ccMixter-Tags: " + song.tags);

	$('#' + page + ' .ccmixter_ref').attr('href', song.url);

	$('#' + page + ' .license').attr('href', song.licenceLink);
	var oldClass = $('#' + page + ' .license').data('license');
	var license = song.license;
	$('#' + page + ' .license').data('license', license);
	if (oldClass) {
		$('#' + page + ' .license').removeClass(oldClass);
	}
	$('#' + page + ' .license').addClass(license);
	$('#' + page + ' .license').attr('alt', song.licenseName);
	var highlight = false;

	console.log("song.isFavourite: "+song.isFavourite);
	if (song.isFavourite)
	{
		$('#' + page + ' .favourite').addClass('active');
	} else {
		$('#' + page + ' .favourite').removeClass('active');
	}

	$('.status').bind('click', function(event) {
	    var status_width = $(event.target).innerWidth();
	    var offset = event.offsetX;
	    var percent;
	    if (offset > status_width) {
	        percent = 100;
	    } else if (offset < 0) {
	        percent = 0;
	    }

  		percent = offset / status_width;
			if (percent > 0) {
  			audio.currentTime = audio.duration * percent;
  			console.log(audio.currentTime);
			}
	});

	$('.forward').bind('click', function() {
    	audio.currentTime += 10;
	    console.log(audio.currentTime);
	});

	$('.rewind').bind('click', function() {
	  audio[0].currentTime -= 10;
	  console.log(audio[0].currentTime);
	});
}

function parseData(songs, idx, callback)
{
	if (idx == songs.length) {
		console.log("Parsed data");
		if (initialStart) {
			localStorage.setItem("initialStart", JSON.stringify(false));
		}
		callback();
	} else {
		var data = songs[idx];
		var song = {};

		var file = null;

		song.id = data.upload_id;
		isSongInDb(song.id, function(found) {
			console.log("Song with id "+song.id+" found in db: "+found);
			if (!found)
			{
				song.title = data.upload_name;
				console.log("Found "+data.files.length+" different files for "+song.title);
				for (i = 0; i < (data.files.length) && (file == null); i++) {
					console.log(data.files[i].file_format_info["format-name"]);

					if (data.files[i].file_format_info["format-name"] == "audio-mp3-mp3")
					{
						file = data.files[i];
					}
				}

				if (file == null) {
					console.log("Found song without mp3. Skipping...");
					parseData(songs, idx+1, callback);
				} else {
					song.url = data.file_page_url;
					song.downloadLink = file.download_url;
					song.licenceLink = data.license_url;
					song.author = data.user_real_name;
					song.tags = data.upload_tags;
					song.file_name = file.file_name;
					song.size = file.file_rawsize;

					song.license = data.license_logo_url;
					song.license = song.license.substring(song.license.lastIndexOf("/")+1, song.license.lastIndexOf("."));
					song.license = song.license.substring(song.license.indexOf("-")+1);
					song.licenseName = data.license_name;

	    		song.isFavourite = ($.inArray(song.id, favourites) > -1);
					song.wasFavourite = false;
				  song.isPlaying = false;
				  song.isPlayed = false;

					song.isEdPick = song.tags.indexOf("editorial_pick") > -1;
					if (song.isEdPick) {
						edPickCount++;
					} else if (!song.isFavourite) {
						normalSongCount++;
					}

					updateSongInDB(song, function() {
						parseData(songs, idx+1, callback);
					});

//					if (!initialStart && (song.id <newestLoadedSong)) {
//						newestLoadedSong = song.id;
//						localStorage.setItem("newestLoadedSong", JSON.stringify(newestLoadedSong));
//					}
				}
			} else {
				parseData(songs, idx+1, callback);
			}
		});
	}
}

function updateSongInDB(song, callback) {
	var trans = db.transaction(['songs'], 'readwrite');
	var store = trans.objectStore('songs');
	debug("[updateSongInDB]:", song);
	var request = store.put(song);

	request.onsuccess = function(evt){
		console.log('Stored ' + evt.target.result);
		if (callback)
		{
			callback();
		}
	};
}

function toggleMedia() {
	console.log("toggleMedia");
	var page = wrapper[1].id;

	console.log("audio.readyState: "+audio.readyState);
	if (audio.readyState == 0)
	{
		console.log("Creating new audio element.");
		audio = new Audio();

		audio.src = currentSong.downloadLink;

		playWhenReady = true;
		downloadSong(currentSong);

  	$('#' + page + ' .player').addClass("pause");
  	$('#' + page + ' .player').removeClass("play");

    var oldPercent = 0;
		audio.addEventListener("timeupdate", function(event) {
			var percent = audio.currentTime * 100 / audio.duration;
			if (percent != oldPercent) {
				progress('play', percent, '#cef58a');
				oldPercent = percent;
			}
		});

		audio.addEventListener("ended", function(event) {
    	$('#' + page + ' .player').addClass("play");
      $('#' + page + ' .player').removeClass("pause");
      currentSong.isPlaying = false;
      currentSong.isPlayed = true;
			updateSongInDB(currentSong);

			if (fav_autoplay) {
				playNextFav = function(song) {
					debug("next fav is ", song);
					audio.pause();
					audio.src = null;
					load(song, 1);
					toggleMedia();
				};
				getPrevFavId(currentSong.id, playNextFav, function() {
					console.log("No new low fav found. Going back to the beginning...");
					getHighestId(true, playNextFav, function() {
						console.log("No highest fav found!");
						alert("Seems you have no more favourites.");
					});
				});
			}
		});
		$('#' + page + ' .player').append(audio);
	} else {
		if (!audio.paused) {
			pauseMedia();
		} else {
			playMedia();
		}
	}
}

function progress(selector, percent, color) {
	$('.'+selector+'_status').css("width", percent+"%");
}

function pauseCurrent(callback) {
	console.log("Pausing current");
	var page = wrapper[1].id;
	audio.pause();
	audio.src = null;
	$('.player').removeClass("pause");
	$('.player').addClass("play");
	$('.status').removeClass("loading");
  progress('loading', 0, 'black');
  progress('play', 0, 'black');

	if (!show_former_favourites && !currentSong.isFavourite && (currentSong.isPlaying || currentSong.isPlayed)) {
		discardSong(downloadNewSongs);
	}
	if (callback) {
		callback();
	}
}

function deleteSong(song, callback)
{
	debug("Deleting song ", song);
	var downloadPath = getStorageUrl(song);
	console.log("Deleting file "+downloadPath);
	resolveLocalFileSystemURL(downloadPath, function(entry) {
		entry.file(function(file) {
			var fileSize = file.size;
			entry.remove(function() {
				console.log("Deleted file "+downloadPath);
				cacheSize -= fileSize;
				var percent = cacheSize * 100 / (storage_size * 1024 * 1024);
				if (percent <= 100) {
					progress("cache", percent, "darkgrey");
				}
				if (callback) {
					callback();
				}
			}, function() {
				console.log("Could not delete file "+downloadPath);
			});
		}, function() {
			console.log("Could not delete file "+downloadPath);
		});
	});
}

function playMedia() {
	currentSong.isPlaying = true;
	updateSongInDB(currentSong);
	var page = wrapper[1].id;
	audio.play();
	playWhenReady = false;
	$('#' + page + ' .player').addClass("pause");
	$('#' + page + ' .player').removeClass("play");
}

function pauseMedia() {
	var page = wrapper[1].id;
	audio.pause();
	$('#' + page + ' .player').addClass("play");
	$('#' + page + ' .player').removeClass("pause");
}

function setupDB(callback) {
	var request = indexedDB.open('ccmixter2go', 103);

	request.onupgradeneeded = function(event) {
	  console.log('Datenbank angelegt');
	  db = this.result;
		var store;
	  if(!db.objectStoreNames.contains('songs'))
		{
	    store = db.createObjectStore('songs', {
	      keyPath: 'id'
	    });
	  } else {
			store = event.currentTarget.transaction.objectStore("songs");
		}
		store.createIndex("filename", "file_name", {unique: true});
		store.createIndex("edPicks", "isEdPick", {unique: false});

		if(!db.objectStoreNames.contains('favourites'))
		{
			store = db.createObjectStore('favourites', {
				keyPath: 'id'
			});
		}

		if(!db.objectStoreNames.contains('edPicks'))
		{
			store = db.createObjectStore('edPicks', {
				keyPath: 'id'
			});
		}
	};

	request.onsuccess = function() {
		db = this.result;
  	console.log('Datenbank geöffnet');
		callback();
	};
}

function setup() {
	$.mobile.loading('show');
	clearCache();
	setupDB(setupOtherStuff);
}

function deleteFileIfNotNeededInCache(entries, index, callback)
{
	if (index < entries.length) {
		console.log("Checking if file should be deleted "+index);
		var entry = entries[index];
		if (!entry.isDirectory)
		{
			entry.file(function(file) {
				console.log(entry.name+" "+file.size);
				loadSongByFilename(entry.name, function(song) {
					if (song.isFavourite)
					{
						debug("Not deleting fav: ", song);
						deleteFileIfNotNeededInCache(entries, index+1, callback);
					} else if (edPicks_only) {
						if (song.isEdPick) {
							debug("Not deleting edPick: ", song);
							deleteFileIfNotNeededInCache(entries, index+1, callback);
						} else {
							debug("Deleting normal songs...", song);
							deleteSong(song, function() {
								deleteFileIfNotNeededInCache(entries, index+1, callback);
							});
						}
					} else if (song.isEdPick) {
						debug("Deleting edPick even if it might be one of the next songs...", song);
						deleteSong(song, function() {
							deleteFileIfNotNeededInCache(entries, index+1, callback);
						});
					} else {
						debug("Not deleting 'normal' song", song);
						deleteFileIfNotNeededInCache(entries, index+1, callback);
					}
				});
			});
		} else {
			deleteFileIfNotNeededInCache(entries, index+1, callback);
		}
	} else {
		callback();
	}
}

function clearCache() {
	getStoredFiles(function(entries) {
		deleteFileIfNotNeededInCache(entries, 0, updateCacheState);
	});
}


function readFileCache() {
	getStoredFiles(function(entries) {
		sumFiles(entries, 0, 0, function(storage_used) {
			cacheSize = storage_used;
			updateCacheState();
		});
	});
}

function updateCacheState() {
	var percent = cacheSize * 100 / (storage_size * 1024 * 1024);
	if (percent > 100) {
		percent = 100;
	}
	progress("cache", percent, "darkgrey");
}

function getStringFromLocalStorage(key, defaultValue) {
	var value = JSON.parse(localStorage.getItem(key));
	return (value == null ? defaultValue : value);
}

function getIntFromLocalStorage(key, defaultValue) {
	var value = JSON.parse(localStorage.getItem(key));
	return Number(value == null ? defaultValue : value);
}

function getBooleanFromLocalStorage(key, defaultValue) {
	var value = JSON.parse(localStorage.getItem(key));
	if (value == null) {
		return defaultValue;
	} else {
		return value = (value || (value == "true"));
	}
}

function loginAndDownloadPlaylist()
{
		loginAtCcmixter(function(loadedFavourites) {
			console.log("Login successful. Playlist with id "+playlistId+" found");
			checkPlaylist(loadedFavourites, 0);
			setupPage();
		});
}

function setupPage() {
		loadNewSongs(0, function() {
			getHighestId(false, function(song)
			{
				currentSong = song;
				loadSong = function(song) {
					currentSong = song;
					console.log("first song:");
					console.log(currentSong);
					if (autoDownloadEnabled()) {
						console.log("Starting first song's download.");
						downloadSong(currentSong);
					} else {
						console.log("No autodownload for first song.");
					}
					load(song, 1);
					$('#wrapper2').show();
					console.log("Leaving setup method");
				};
				if (edPicks_only && (!song.isEdPick || song.isSkipped)) {
					if (song.isEdPick) {
						debug("Song was skipped", song);
					} else {
						debug("Song is no edpick", song);
					}
					getPrevSongId(song.id, loadSong, function() {
						console.log("No new edPick found. Maybe all are loaded?");
						alert("Seems you have heard and discarded all edPicks at ccMixter. I cannot play anything.");
					});
				} else {
					loadSong(song);
				}
			});
	}, function() {
		console.log("No new songs found. Maybe all are loaded?");
		alert("Seems you have heard and discarded all songs at ccMixter. I cannot play anything.");
	});
}

function showCredentialsDialog(callback) {
	if (user != null) {
		$('#user').val(user);
	}
	if (password != null) {
		$('#password').val(password);
	}

/*
	$('#credentials_dialog').on({
		popupafterclose: function() {
			console.log(user+" / "+$('#user').val()+" / "+password+" / "+$('#password').val());
			if ((user == $('#user').val()) && (password == $('#password').val()))
			{
				alert("credentials not changed");
				setupPage();
			}
		}
	});
	*/
	$('#credentials_dialog').submit(function() {
		$('#credentials_dialog').popup('close');
		if ((user == $('#user').val()) && (password == $('#password').val()))
		{
			console.log("credentials not changed");
			return false;
		} else {
			user = $('#user').val();
			password = $('#password').val();
			localStorage.setItem('user', JSON.stringify(user));
			localStorage.setItem('password', JSON.stringify(password));
			loginAndDownloadPlaylist();
			return false;
		}
	});
	$('#credentials_dialog').popup('open');
}

function setupOtherStuff() {
	readFileCache();
	audio = new Audio();

	auto_download = getBooleanFromLocalStorage("auto_download", true);
	auto_download_wlan_only = getBooleanFromLocalStorage("auto_download_wlan_only", true);
	edPicks_only = getBooleanFromLocalStorage("edPicks_only", true);
	initialStart = getBooleanFromLocalStorage("initialStart", true);

	newestLoadedSong = getIntFromLocalStorage("newestLoadedSong", Number.MAX_VALUE);

	storage_size = getIntFromLocalStorage("storage_size", 50);
	/*
	if (initialStart) {
		cordova.exec(function(freeSpace) {
			freeSpace = freeSpace / 1024 / 1024;
			if (freeSpace > storage_size)
			{
				storage_size = freeSpace - 10;
				if (storage_size < 10) {
					alert("Less than 10 MB storage available.<br>You might not be able to use ccMixter2go.", "Not enough free space.");
				}
				console.log("Storage limited to "+storage_size);
			}
		}, function() {
			alert("Could not get free space.");
		}, "File", "getFreeDiskSpace", []);
	}
  */

	console.log("auto_download: "+auto_download+" "+"auto_download_wlan_only: "+auto_download_wlan_only);

	if (auto_download) {
		console.log("auto download enabled");
		$("#auto-download-switch").val("true");
		$("#auto-download-switch").slider("refresh");
	}

	if (auto_download_wlan_only) {
		console.log("auto download via wlan only");
		$("#auto-download-wlan-switch").val("true");
		$("#auto-download-wlan-switch").slider("refresh");
	}

	if (edPicks_only) {
		console.log("edPicks_only enabled");
		$("#edPicks_only-switch").val("true");
		$("#edPicks_only-switch").slider("refresh");
	}

	getFromDB(function(loaded_favourites) {
		favourites = loaded_favourites;
		console.log("Favourites from db are:");
		console.log(favourites);

		console.log("Found "+normalSongCount+" 'normal' songs.");

		user = getStringFromLocalStorage("user", null);
		password = getStringFromLocalStorage("password", null);

		if (online()) {
			if (user != null) {
				loginAndDownloadPlaylist();
			} else {
				console.log("No userdata found. Not downloading fav data from ccmixter");
				$.mobile.loading('hide');
				setupPage();
			}
		} else {
			console.log("We are not online...");
			$.mobile.loading('hide');
			setupPage();
		}
	});

	var wrapper1 = $("#wrapper1");
	var wrapper2 = $("#wrapper1").clone();
	wrapper2.attr("id", "wrapper2");
	wrapper2.insertAfter(wrapper1);
	var wrapper3 = $("#wrapper1").clone();
	wrapper3.attr("id", "wrapper3");
	wrapper3.insertAfter(wrapper2);
	wrapper = $(".wrapper").get();


	$('.player').bind('click', function() {
		toggleMedia();
	});

	$("#" + wrapper[0].id).hide();
	$("#" + wrapper[1].id).hide();
	$("#" + wrapper[2].id).hide();

	$('#options_dialog').popup({
		history : false
	});
	$('#date_dialog').popup({
		history : false
	});

	$("#auto-download-switch").on("change", function(event, ui) {
		auto_download = event.target.value == 'true';
		localStorage.setItem("auto_download", JSON.stringify(auto_download));
		console.log("auto download enabled: "+auto_download);
		downloadNewSongs();
	});

	$("#auto-download-wlan-switch").on("change", function(event, ui) {
		auto_download_wlan_only = event.target.value == 'true';
		localStorage.setItem("auto_download_wlan_only", JSON.stringify(auto_download_wlan_only));
		downloadNewSongs();
	});

	$("#edPicks_only-switch").on("change", function(event, ui) {
		edPicks_only = event.target.value == 'true';
		if (ft != null) {
			getSongById(download_id, function() {
				if (edPicks_only != song.isEdPick) {
					ft.abort();
					deleteSong(song);
				}
			});
		}
		clearCache();
		localStorage.setItem("edPicks_only", JSON.stringify(edPicks_only));
		audio.pause();
		getHighestId(false, function(song) {
			console.log("Found highest id");
			currentSong = song;
			downloadNewSongs(song.id);
			if (edPicks_only) {
				if (song.isEdPick) {
					load(song, 1);
				} else {
					getPrevSongId(song.id, function(song) {
						load(song, 1);
					}, function() {
						console.log("No edPick with id lower than "+song.id+" found.");
						alert("Seems you discarded all known edPicks.");
					});
				}
			} else {
				load(song, 1);
			}
		}, function() {
			console.log("No highest id for an edpick found.");
			alert("Seems you discarded all known edPicks.");
		});
	});

/*
	$("#auto_download_max_songs").on("change", function(event, ui) {
		auto_download_wlan_only = event.target.value == 'true';
		localStorage.setItem("auto_download_wlan_only", JSON.stringify(auto_download_wlan_only));
		downloadNewSongs();
	});
*/
	$('.share').bind('click', function() {
		window.plugins.socialsharing.share('I am ready to share!');
	});

	$('#fav_autoplay').bind('click', function() {
		console.log("Enabling fav_autoplay");
		resetSpecialPlay();
		fav_autoplay = true;
		fav_download = autoDownloadEnabled();
		var startFavPlay = function() {
			getHighestId(true, function(song) {
				audio.pause();
				audio.src = null;
				load(song, 1);
				toggleMedia();
				closeOptionsDialog();
			});
		};
		if (autoDownloadEnabled()) {
			console.log("autoDownloadEnabled. Starting Fav Play");
			startFavPlay();
		} else {
			console.log("autoDownloadEnabled disabled. Looking for stored fav.");
			isAtLeastOneFavReadyToPlay(0, startFavPlay, function() {
				console.log("No favourites downloaded on device");
				fav_autoplay = false;
				fav_download = false;
				closeOptionsDialog();
				console.log("No favourites downloaded on device");
				alert("No favourites downloaded on device");
			});
		}
	});

	$('#show_former_favourites').bind('click', function() {
		console.log("Showing former favourites only");
		audio.pause();
		audio.src = null;
		resetSpecialPlay();
		show_former_favourites = true;
		getPrevSongId(Number.MAX_VALUE, function(song) {
			currentSong = song;
			load(song, 1);
			closeOptionsDialog();
		}, function() {
			console.log("No former favourite found.");
			alert("No former favourite found.");
		});
	});

	$('.wrapper').bind('swipeleft', function(event) {
		pauseCurrent();
		console.log("swipeleft");
		getNextSongId(currentSong.id, fav_autoplay, activateNextSong, function() {
			if (fav_autoplay)
			{
				getNextSongId(-1, true, activateNextSong, function() {
					alert("No more favourites available!");
				});
			} else if (show_former_favourites) {
				alert('No more "deleted" favourites available!');
			} else {
				console.log("updating...");
				$.mobile.loading('show');
				loadNewSongs(0, function() {
					nextSong = getNextSongId(currentSong.id, function(song) {
						activateNextSong(song);
					}, function() {
						console.log("No newer song available.");
						alert("No newer song available.");
					});
				});
			}
		});
	});

	$('.wrapper').bind('taphold', function(event) {
		taphold();
	});

  $('#discardButton').bind('click', function(event) {
		debug("Song was discarded by user", currentSong);
		currentSong.isFavourite = false;
		swipeRight();
	});

	$('.wrapper').bind('swiperight', function(event) {
		swipeRight();
	});

	$('.wrapper').bind('swipeup', function(event) {
		swipeUp();
	});

	$('#options_button').bind('click', function(event) {
		$("#storage_size").val(storage_size);
		$("#storage_size").attr("max", storage_size+100);
		$("#storage_size").slider("refresh");
		$('#options_dialog').popup('open');
		$('#options_dialog').on({
			popupafterclose: function() {
				var new_storage_size = $("#storage_size").val();
				if (new_storage_size != storage_size) {
					storage_size = new_storage_size;
					localStorage.setItem("storage_size", JSON.stringify(storage_size));
				}
			}
		});
	});

	$('#actions_button').bind('click', function(event) {
		$('#actions_dialog').popup('open');
	});
	$('.gfx_credits').bind('click', function(event) {
		$('#options_dialog').popup('close');
		$('#gfx_credits_dialog').popup('open');
	});
	$('.show_all_songs').bind('click', function() {
		resetSpecialPlay();
		audio.pause();
		audio.src = null;
		progress('play', 0, 'black');
		show_all_songs = true;
		closeOptionsDialog();
	});

	$('#logindata').bind('click', function() {
		closeOptionsDialog();
		showCredentialsDialog();
	});

  $('.load_favourites').bind('click', function() {
		closeOptionsDialog();
		$('.load_all').css('display', 'block');
		$('.load_favourites').css('display', 'none');
	});

	$('.load_all').bind('click', function(event) {
		closeOptionsDialog();
		$('.load_all').css('display', 'none');
		updateFavouritesMenu();
	});

	$('.favourite').bind('click', function() {
		currentSong.isFavourite = !currentSong.isFavourite;
		currentSong.wasFavourite = !currentSong.isFavourite;
		console.log("fav toggeling");
		console.log(currentSong);
		if (!currentSong.isFavourite) {
			$('#' + wrapper[1].id + ' .favourite').removeClass('active');
		} else {
			$('#' + wrapper[1].id + ' .favourite').addClass('active');
		}

		if (online()) {
	 	  if (playlistId > -1) {
				updatePlaylist(currentSong);
		  } else {
		  	console.log("ccmixter playlist not found");
		  }
		}
		if (currentSong.isFavourite) {
			insertIntoFavDB(currentSong);

			var downloadPath = getStorageUrl(currentSong);
			resolveLocalFileSystemURL(downloadPath,
				function(entry) {
					console.log("Song found on device. Getting file size.");
					entry.file(function(file) {
						console.log("file.size: "+file.size);
					});
					cacheSize -= file.size;
					updateCacheState();
				});
		} else {
			favourites.splice(favourites.indexOf(currentSong.id));
			deleteFromFavDB(currentSong);
		}


		console.log("Favourites are now: ");
		console.log(favourites);
		updateSongInDB(currentSong);
		updateFavouritesMenu(currentSong.isFavourite);
	});
};

function updatePlaylist(song, callback) {
	var url = "http://ccmixter.org/api/playlist/";
	url += (song.isFavourite ? "add" : "remove");
	url += "/" + song.id + "/" + playlistId;
	console.log("Calling "+url);
	$.ajax({ url: url, cache: false, timeout: 30000})
		.done(function(data) {
			console.log("Playlist updated.");
			if (callback) {
				callback();
			}
		})
		.fail(function(xhr) {
			alert(JSON.stringify(xhr));
			callback();
		});
}

function checkPlaylist(loadedFavourites, idx) {
	if (idx < favourites.length) {
		if (loadedFavourites.indexOf(favourites[idx]) == -1) {
			console.log("Fav with id "+favourites[idx]+" not stored in ccMixter playlist");
			getSongById(favourites[idx], function(song) {
				if (song) {
					console.log(song);
					updatePlaylist(song, function() {
						checkPlaylist(loadedFavourites, idx+1);
					});
				} else {
					checkPlaylist(loadedFavourites, idx+1);
				}
			});
		} else {
			console.log("Fav with id "+favourites[idx]+" stored in ccMixter playlist");
			checkPlaylist(loadedFavourites, idx+1);
		}
	} else {
		favourites = loadedFavourites;
		console.log("Checking favs...");
		loadFavData(favourites, 0);
	}
}

function discardSong(callback) {
		console.log("ft != null: "+(ft != null));
		console.log("download_id == current "+download_id+" / "+current);
		currentSong.isSkipped = true;
		if ((idx = favourites.indexOf(currentSong.id)) > -1)
		{
			currentSong.isFavourite = false;
			favourites.splice(favourites, idx);
			console.log("Favourites are now: ");
			console.log(favourites);
			deleteFromFavDB(currentSong);
		}
		updateSongInDB(currentSong);
		if ((ft != null) && (download_id == current)) {
			ft.abort();
			ft = null;
		}
		deleteSong(currentSong, downloadNewSongs);
}

function taphold() {
	console.log("taphold");
	$('#discard_dialog').popup("open");
}

function swipeRight() {
	console.log("[swipeRight]");
	pauseCurrent(function() {
		getPrevSongId(currentSong.id, function(song)
		{
			activatePrevSong(song);
		}, function() {
			if (!fav_autoplay && !show_former_favourites) {
					console.log("[swipeRight] updating...");
					$.mobile.loading('show');
					loadOldSongs(edPicks_only ? edPickCount : normalSongCount, function(song) {
						activatePrevSong(song);
						downloadNewSongs();
					});
			} else {
				getPrevSongId(Number.MAX_VALUE, function(song) {
					activatePrevSong(song);
				}, function() {
					console.log("[swipeRight] No more songs available");
					alert("Seems you have heard and discarded all songs.");
				});
			}
		});
	});
}

function loadOldSongs(offset, callback) {
	console.log("[loadOldSongs] offset param: "+offset);
	getSongList(offset, function() {
		getPrevSongId(currentSong.id, function(song) {
			console.log("Found 'new' old song.");
			if (callback) {
				console.log("[loadOldSongs] callback.");
				callback(song);
			}
		}, function() {
			console.log("Found known song. Increasing offset...");
		  loadOldSongs(offset+limit);
		});
	});
}

function loadNewSongs(offset, callback) {
	console.log("loadNewSongs");
	getSongList(0, function(id) {
		console.log("newestLoadedSong: "+id);
		if (id > newestLoadedSong) {
		    offset += resultSize;
		    console.log("offset set to:"+resultSize);
		    loadNewSongs(offset, callback);
		} else {
			callback();
		}
	});
}

function activateNextSong(nextSong) {
	current = nextSong;
    load(nextSong, 2);
	$("#" + wrapper[1].id).hide("slide", {}, 400);
	$("#" + wrapper[2].id).show("slide", {
		direction : "right"
	}, 400, function() {
		wrapper.push(wrapper.shift());
	});
}

function activatePrevSong(prevSong) {
	load(prevSong, 0);
	$("#" + wrapper[1].id).hide("slide", {
		direction : "right"
	}, 400);
	$("#" + wrapper[0].id).show("slide", {}, 400, function() {
		wrapper.unshift(wrapper.pop());
	});
}

function checkSong(candidate) {
	if (candidate == null) {
	    return -1;
	}
	if (show_all_songs)
	{
		console.log("show all songs");
		return 1;
	} else if (show_former_favourites) {
		return candidate.wasFavourite ? 1 : 0;
	} else if (edPicks_only) {
		if (candidate.isEdPick)
	 	{
			return candidate.isSkipped ? 0 : 1;
		} else {
			return 0;
		}
	} else if (fav_autoplay)
	{
 		if (candidate.isFavourite)
		{
			console.log("Found fav");
			return 1;
		} else {
			return 0;
		}
	} else if (candidate.isFavourite || (!candidate.isSkipped && !candidate.isPlayed))
	{
		return 1;
	} else {
		return 0;
	};
}

function getSongId(startId, favOnly, searchFunction, success, error)
{
	checkNextSong = function(startId) {
		searchFunction(startId, favOnly, function(candidate) {
			if (checkSong(candidate) == 1)
			{
				debug("Found song", candidate);
				success(candidate);
				return;
			} else {
				debug("discarding ", candidate);
				checkNextSong(candidate.id);
			}
		}, error);
	};
	checkNextSong(startId);
}

function getNextSongId(startId, favOnly, success, error)
{
	console.log("Searching for next song. fav_autoplay: "+fav_autoplay);
	getSongId(startId, favOnly, loadSongWithIdHigherThan, success, error);
}

function getPrevSongId(startId, success, error)
{
	console.log("Searching for prev song. fav_autoplay: "+fav_autoplay);
	getSongId(startId, false, loadSongWithIdLowerThan, success, error);
}

function getPrevFavId(startId, success, error)
{
	console.log("Searching for prev fav starting at "+startId);
	getSongId(startId, true, loadSongWithIdLowerThan, function(song) {
		isSongReadyToPlay(song, function() {
			console.log("Fav with id "+song.id+" is ready to play");
			success(song);
		}, function() {
			console.log("We are looking for favs and song is not ready to play.");
			getPrevFavId(song.id, success, error);
		});
	});
}

function updateFavouritesMenu(enable) {
	if (enable) {
		$('.load_favourites').css('display', 'block');
		$('.clear_favourites').css('display', 'block');
	} else {
		$('.load_favourites').css('display', 'none');
		$('.clear_favourites').css('display', 'none');
	}
}

function getFromLocalStorage() {
	var loaded_data = localStorage.getItem("songs");
	loaded_data = JSON.parse(loaded_data);
	if (loaded_data == null) {
		loaded_data = new Object();
		loaded_data.ids = new Array();
		loaded_data.songs = new Array();
	}
	return loaded_data;
}

function loadSongByFilename(filename, callback) {
	console.log("Trying to load song for "+filename);
	var trans = db.transaction(['songs'], 'readonly');
	var store = trans.objectStore('songs');
	var index = store.index('filename');
	var request = index.get(filename);
	request.onerror = function(event) {
  	alert("File not found in db!")
		callback();
	};
	request.onsuccess = function(event) {
		var song = event.target.result;
		if (song == null) {
			console.log("Song for "+filename+" not found in db");
			callback();
		} else {
			debug("Found song in db by filename:", song);
			callback(song);
		}
	};
}

function loadSongByFilename(filename, callback) {
	console.log("Trying to load song for "+filename);
	var trans = db.transaction(['songs'], 'readonly');
	var store = trans.objectStore('songs');
	var index = store.index('filename');
	var request = index.get(filename);
	request.onerror = function(event) {
  	alert("File not found in db!")
		callback();
	};
	request.onsuccess = function(event) {
		var song = event.target.result;
		if (song == null) {
			console.log("Song for "+filename+" not found in db");
			callback();
		} else {
			debug("Found song in db by filename:", song);
			callback(song);
		}
	};
}

function getHighestId(favourites, success, error) {
	var dbName = "songs";
	if (favourites) {
		dbName = "favourites";
	}
	console.log("Trying to find highest id from "+dbName);
	var trans = db.transaction([dbName], 'readonly');
	var store = trans.objectStore(dbName);
	var range = IDBKeyRange.lowerBound(-1);
	var cursorRequest = store.openCursor(range, "prev");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			debug("Song with highest id is: ", song);
			success(song);
		} else {
			error();
		}
  };
}

function loadSongWithIdLowerThan(maxValue, favOnly, success, error) {
	var dbName = "songs";
	if (favOnly) {
		dbName = "favourites";
	}
	console.log("Trying to load song with id lower than "+maxValue+" from "+dbName);
	var trans = db.transaction([dbName], 'readonly');
	var store = trans.objectStore(dbName);
	var range = IDBKeyRange.upperBound(maxValue-1);
	var cursorRequest = store.openCursor(range, "prev");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			debug("Song with id lower than "+maxValue+" is: ", song);
			success(song);
		} else {
			console.log("Nothing found");
			error();
		}
  };
}

function loadSongWithIdHigherThan(maxValue, favOnly, success, error) {
	var dbName = "songs";
	if (favOnly) {
		dbName = "favourites";
	}
	console.log("Trying to load song with id higher than "+maxValue+" from "+dbName);
	var trans = db.transaction([dbName], 'readonly');
	var store = trans.objectStore(dbName);
	var range = IDBKeyRange.lowerBound(maxValue+1);
	var cursorRequest = store.openCursor(range, "next");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
				success(song);
		} else {
			console.log("Nothing found");
			error();
		}
  };
}

function deleteFromFavDB(song) {
	debug("[deleteFromFavDB]", song);
	var trans = db.transaction(['favourites'], 'readwrite');
	var store = trans.objectStore('favourites');
	store.delete(song.id);
}

function insertIntoFavDB(song) {
	debug("[insertIntoFavDB]", song);
	var trans = db.transaction(['favourites'], 'readwrite');
	var store = trans.objectStore('favourites');
	store.put(song);
}

function getSongById(id, callback) {
	console.log("Loading song by id "+id);
	var trans = db.transaction(['songs'], 'readonly');
	var store = trans.objectStore('songs');
	var request = store.get(id);
	request.onerror = function(event) {
		console.log("isSongInDb error:");
		console.log(event);
	  callback(false);
	};
	request.onsuccess = function(event) {
		callback(event.target.result);
	};
}

function isSongInDb(id, callback) {
	console.log("Checking if song with id "+id+" is in db");
	getSongById(id, function(song) {
		callback(song != null);
	});
}

function getCount(edPicksOnly, callback)
{
	var countRequest = db.transaction(['songs'], 'readonly').
		objectStore('songs').
		index(edPicksOnly?"edPicks":"id").
		count();
	countRequest.onsuccess = function()
		{
			var count = countRequest.result;
			console.log("[getCount] edPicks: "+edPicksOnly+" count: "+count);
			console.log(countRequest);
		  callback(count);
		}
}


function getFromDB(callback) {
	var trans = db.transaction(['songs'], 'readonly');
	var store = trans.objectStore('songs');
	var range = IDBKeyRange.lowerBound(0);
	console.log("Reading data from db...");
	var cursorRequest = store.openCursor(range);
	if (user == null) {
		console.log("using favs from db");
	}
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			console.log(song);
			if (song.isEdPick) {
				edPickCount++;
			} else {
				normalSongCount++;
			}
			if (song.isFavourite) {
				favourites.push(song.id);
			}
			result.continue();
		} else {
			if (user == null) {
				favourites.sort(function(a, b){return a-b});
			}
			console.log("all data read:");
			callback(favourites);
		}
  };
};

function closeOptionsDialog() {
	$('#options_dialog').popup('close');
	$('#actions_dialog').popup('close');
}

function loginAtCcmixter(callback)
{
	$.mobile.loading('show');
	$.ajax({ url: "http://ccmixter.org/login", cache: false, timeout: 30000, method: "POST",
		data: {user_name: "musikpirat", user_password: "3nt3-3nt3",
		form_submit: "Log In", http_referer: "http%3A%2F%2Fccmixter.org%2Flogout",
		userlogin: "classname"}})
		.done(function(data) {
			if (data.indexOf("var user_name =  null;") > -1) {
				alert("Please check your login details.", "Login failed.");
				showCredentialsDialog();
			} else {
				checkIfPlaylistExists(callback);
			}
		})
		.fail(function(xhr) {
			alert(JSON.stringify(xhr));
		})
		.always(function() {
			$.mobile.loading('hide');
		});
}

function checkIfPlaylistExists(callback) {
	console.log("Loading user's playlists from ccmixter...");
		$.ajax({ url: "http://ccmixter.org/api/queries?items=dataview%3Dplaylists%26limit%3D10%26user%3D"+user,
			cache: false, timeout: 30000, dataType: 'json'})
			.done(function(data) {
				var playListFound = false;
				for (i = 0; i < data[0].items.length; i++) {
					playlist = data[0].items[i];
					console.log("Playlist: "+playlist.cart_name);
					if (playlist.cart_name == "ccMixter2go") {
						console.log("Found ccMixter2go-playlist");
					 	playlistId = playlist.cart_id;
						loadPlaylist(playlistId, callback);
						return;
					}
				};
				createPlaylist(callback);
			})
			.fail(function(xhr) {
				alert(JSON.stringify(xhr));
			})
			.always(function() {
				$.mobile.loading('hide');
			});
}

function loadFavData(loadedFavourites, idx) {
	if (idx == loadedFavourites.length)
	{
		console.log("All fav checked");
	} else {
		getSongById(loadedFavourites[idx], function(song) {
			if (song == null) {
				var url = "http://ccmixter.org/api/query?f=json&ids="+loadedFavourites[idx];
				console.log("Loading fav data from "+url);
				$.ajax({ url: url,
					cache: false, timeout: 30000, dataType: 'json'}).
					done(function(data) {
						parseData(data, 0, function() {
							getSongById(loadedFavourites[idx], function(song) {
								song.isFavourite = true;
								insertIntoFavDB(song);
							});
							if (idx < favourites.length)
							{
								loadFavData(loadedFavourites, idx+1);
							} else {
								callback(loadedFavourites);
							}
						});
					}).
					fail(function(xhr) {
						alert(JSON.stringify(xhr));
					}).
					always(function() {
					});
			} else {
				if (!song.isFavourite) {
					console.log("Fav with id "+song.id+" not marked as fav in db");
					song.isFavourite = true;
					insertIntoFavDB(song);
					updateSongInDB(song);
				}
				loadFavData(loadedFavourites, idx+1);
			}
		});
	}
};

function loadPlaylist(_playlistId, callback) {
	playlistId = _playlistId;
	console.log("Loading playlist with id "+playlistId+" from ccmixter...");
	$.ajax({ url: "http://ccmixter.org/api/query?f=json&playlist="+playlistId,
		cache: false, timeout: 30000, dataType: 'json'})
		.done(function(data) {
			console.log("Got playlist with id "+playlistId+" from ccmixter.");
			var loadedFavourites = [];
			$.each(data, function(key, song)
			{
				loadedFavourites.push(song.upload_id);
			});
			loadedFavourites.sort(function(a, b){return a-b});
			console.log(loadedFavourites);
			callback(loadedFavourites);
		})
		.fail(function(xhr) {
			alert(JSON.stringify(xhr));
		})
		.always(function() {
		});
}

function createPlaylist(callback) {
	console.log("creating new playlist");
	$.ajax({ url: "http://ccmixter.org/api/playlist/new?cart_name=ccMixter2go", cache: false, timeout: 30000})
		.done(function(data) {
			checkIfPlaylistExists(function() {
				console.log("Playlist successfully created. Id is: "+playlistId);
				callback();
			});
		})
		.fail(function(xhr) {
			alert(JSON.stringify(xhr));
		})
		.always(function() {
			$.mobile.loading('hide');
		});
}

function isAtLeastOneFavReadyToPlay(idx, success, error) {
	if (idx < favourites.length) {
		getSongById(favourites[idx], function(song) {
			console.log("Checking if fav with idx "+idx+" / id "+favourites[idx]+" is downloaded", song);
			isSongReadyToPlay(song, function() {
					debug("Fav is ready to play: ", song);
					success();
					return;
			}, function() {
				isAtLeastOneFavReadyToPlay(idx+1, success, error)
				return;
			});
		});
	} else {
		console.log("idx < favourites.length");
		console.log(favourites);
		error();
	}
}

function getSongList(offset, success, error)
{
	var url;
	if (edPicks_only) {
		url = "http://ccmixter.org/api/query?f=json&limit="+limit+"&tags=remix,editorial_pick&offset="+offset;
	} else {
		url = "http://ccmixter.org/api/query?f=json&limit="+limit+"&tags=remix&offset="+offset;
	}
	console.log("Calling "+url);
	$.mobile.loading('show');

  var oldNormalSongCount = normalSongCount;
  var oldEdPickCount = edPickCount;
  var finish = function() {
		var noNewSongsFound = (normalSongCount == oldNormalSongCount);
		if (edPicks_only) {
			noNewSongsFound = (edPickCount == oldEdPickCount);
		}
		if (noNewSongsFound && error) {
			error();
//			var newOffset = (offset+1) * limit;
//			console.log("No new songs found. Increasing offset to "+newOffset);
//			getSongList(newOffset, callback);
			return;
		}
		$("#" + wrapper[1].id).show();
		$.mobile.loading('hide');
		if (success) {
			console.log("[getSongList] callback");
			success();
		} else {
			console.log("[getSongList] no callback");
		}
	};
	$.ajax({ url: url, cache: false, timeout: 30000, dataType: 'json'})
		.done(function(data) {
			parseData(data, 0, finish);
		})
		.fail(function(xhr) {
			alert(JSON.stringify(xhr));
			finish();
		});
}

function getStorageUrl(song)
{
	return cordova.file.externalDataDirectory + song.file_name;
}

//just for dev
if (location.href.indexOf("/easy/www/index.html") > -1)
{
	$(document).ready(function() {
		setup();
	});
}

function debug(message, song) {
	console.log(message+" / "+song.id+" / "+song.author+" / "+song.title)
}
