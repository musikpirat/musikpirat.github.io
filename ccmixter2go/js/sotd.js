const baseUrl = "https://ccmixter.christian-hufgard.de/";
var current;
var currentSong;
var position = null;
var wrapper;
var basePath;
var resultSize;
var limit = 25;

var auto_download;
var auto_download_wlan_only;

var ft = null;

var download_id;

var playing;
var lastUpdate = 0;

var audio = null;

var playWhenReady = false;

var playlistId = -1;

var user = null;

var password = null;

var storage_size;

var fav_download = false;

var db;

var newestLoadedSong;

var cacheSize = -1;

var initialStart;

var randomPlay;

var allSongs = false;

var show_former_favourites = false;

var randomSongs;

var documentTitle = "ccmixter2Go";

var newDocumentTitle = true;

var shiftedDocumentTitle = "";

function findSongThatMightBeNotDownloaded(id, type, success, error)
{
	console.log("[findSongThatMightBeNotDownloaded] id "+id+" type: "+type);
	loadSongWithIdLowerThan(id, type, function(candidate)
	{
		if (candidate.isFavourite ||
			(!fav_download && !candidate.isSkipped))
		{
			debug("[findSongThatMightBeNotDownloaded] candidate:", candidate);
			return success(candidate);
		} else {
			debug("[findSongThatMightBeNotDownloaded] Song was skipped:", candidate);
			findSongThatMightBeNotDownloaded(candidate.id, type, success, error);
		}
	}, error);
}

function online() {
	if (!navigator.connection) {
		console.log("Cannot get connection state.");
		return false;
	}

	var networkState = navigator.connection.effectiveType;
  console.log("networkState: ["+networkState+"]");
	if ((networkState == "undefined"))
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

	var networkState = navigator.connection.effectiveType;

  console.log("networkState: ["+networkState+"]");

	if ((networkState == "ETHERNET") ||
		  (networkState == "WIFI"))
	{
		console.log("auto_download_wlan_only and network is "+networkState);
		return true;
	} else {
		console.log("auto_download_wlan_only and network is "+networkState);
		return false;
	}
}

function getDownloadStartId(type, lastFavourite, success) {
	if (lastFavourite == null) {
		startId = getHighestId(type, function(song) {
			debug("Highest song from "+type+":", song);
			//adding one so the song will be found by getPrevFavId
			success(song.id+1);
		}, function() {
			console.log("No song from "+type+" found");
		});
	} else {
		success(lastFavourite);
	}
}

function autoDownload(type, lastSong, searchFunction) {
	console.log("autoDownload");
  if (!autoDownloadEnabled())
	{
		return;
	}

	if (ft !== null) {
		console.log("Found running dl. Not starting another one.");
		return;
	}

	getDownloadStartId(type, lastSong, function(lastSong) {
		console.log("lastSong from "+type+": "+lastSong);
		searchFunction(lastSong, function(song, readyToPlay) {
			debug("Prev from "+type, song);
			if (readyToPlay) {
				debug("Found song from "+type+" that is ready to play ", song);
				autoDownload(type, song.id, searchFunction);
			} else {
				debug("Found song from "+type+" that is not yet downloaded ", song);
				startDownload(song, false, function(song) {
					autoDownload(type, song.id, searchFunction);
				});
			}
		}, function() {
			console.log("All songs from "+type+" should be downloaded.");
			if (playMode !== "favourites") {
				getCount(type === "edPicks" ? "edPicks" : "songs", function(count) {
					getSongList(count, function() {
						autoDownload(type, lastSong, searchFunction);
					}, function() {
						alert("Could not check for new songs.");
					});
				});
			}
		});
	});
}

function downloadFavourites(lastFavourite) {
	autoDownload("favourites", lastFavourite, function(lastFavourite, success, error) {
		getPrevFavId(lastFavourite, false, success, error);
	});
}

function fillCache(lastSong) {
	autoDownload(playMode, lastSong, function(lastSong, success, error) {
		getPrevSongId(lastSong, playMode, function(song) {
			isSongReadyToPlay(song, function() {
				success(song, true);
			}, function() {
				success(song, false);
			})
		}, error);
	});
}

function downloadNewSongs(startId, type) {
	console.log("Intercepted downloadNewSongs("+startId+", "+type+")");
	fillCache(startId);
	return;
	console.log("downloadNewSongs, type: "+playMode);
	if (playMode == "favourites") {
		downloadFavourites();
		return;
	}
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

	if (!type) {
		type = "edPicks";
		if (fav_download) {
			type = "favourites";
		} else if (playMode == "allSongs") {
			type = "songs";
		}
	}
	findSongThatMightBeNotDownloaded(startId, type, function(song) {
		console.log("checking if file with id "+song.id+" already downloaded");
		downloadSong(song);
	}, function() {
	  if (!fav_download && !show_former_favourites) {
			console.log("Downloaded all known files. Let's see if there are more.");
			getCount(playMode == "edPicks" ? "edPicks" : "songs", function(count) {
				getSongList(count, function() {
						//the easiest way is to start all over.
						getHighestId("songs", function(song) {
							downloadNewSongs(song.id);
						});
				}, function() {
					console.log("No new songs found. Aborting download search.");
					$.mobile.loading('hide');
					return;
				});
			});
    } else {
			console.log("Downloaded all "+type);
			if (fav_download) {
				fav_download = false;
				downloadNewSongs("songs");
			} else {
					console.log("Finished downloading.");
			}
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
		startDownload(song, abortDownload, function(song) {
			downloadNewSongs(song.id-1);
		});
	});
}

function isSongReadyToPlay(song, isReadyCallback, isNotReadyCallback) {
	isReadyCallback(song);
	return;
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
						dialog("Could not remove partial download!");
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
				loadSongByFilename(entry.name, playMode, function(song)
				{
					if (song != null) {
						if (!song.isFavourite) {
							sum += file.size;
							console.log("Sum is now: "+sum);
							sumFiles(entries, index+1, sum, callback);
						} else {
							console.log("Found fav ("+entry.name+"). Not counting");
							sumFiles(entries, index+1, sum, callback);
						}
					} else {
						loadSongByFilename(entry.name, "favourites", function(song) {
							if (song != null) {
								console.log("Found fav ("+entry.name+"). Not counting");
								sumFiles(entries, index+1, sum, callback);
							} else {
								console.log("Song is neither song nor favourite. Must be an edPick.");
								sum += file.size;
								console.log("Sum is now: "+sum);
								sumFiles(entries, index+1, sum, callback);
							}
						});
					}
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
	var entries = [];
	callback(entries);
	return;
	/*
	cacheName = "ccmixter2go";
	caches.open(cacheName).then(function(cache) {
	*/
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

function startDownload(song, abortDownload, finished)
{
	if ((song.size + cacheSize > storage_size * 1024 * 1024) &&
			(song.id != currentSong.id) && !song.isFavourite)
	{
		var mbFree = (storage_size * 1024 * 1024 - cacheSize) / 1024 / 1024;
		var mbNeeded = song.size / 1024 / 1024;
		console.log("Not enough space in cache ("+mbFree.toFixed(2)+") for song ("+mbNeeded.toFixed(2)+")");
		getCachedSongs(function (cachedSongs) {
			console.log("cachedSongs:");
			console.log(cachedSongs);
			getDistanceForSong(song, currentSong, function(distance) {
				console.log("Distance current<->song / cachedSongs[0]: "+distance+" / " +cachedSongs[0].distance);
				if (distance < cachedSongs[0].distance) {
					debug("Deleting ", cachedSongs[0]);
					deleteSong(cachedSongs[0], function() {
						console.log("Cache size is now: "+cacheSize+". Song size: "+song.size);
						startDownload(song, abortDownload, finished);
					});
				} else {
					console.log("Cache should be filled");
				}
			});
		});
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
		finished(song);
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
			dialog("Damn!");
		}
	};
}

function startPlaying(song) {
	if (playWhenReady) {
		var songUrl = song.downloadLink;
		songUrl = "https://ccmixter.christian-hufgard.de/"+songUrl.substr(songUrl.indexOf("/content")+1);
		console.log("Setting audio.src to "+songUrl);
		audio.src = songUrl;
		playMedia();
		return;
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
	localStorage.setItem("currentSongId", JSON.stringify(song.id));
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

  documentTitle = song.title + " / " + song.author;
  newDocumentTitle = true;

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
}

function parseData(type, songs, idx, callback)
{
	if (idx == songs.length) {
		console.log("Parsed data");
		callback();
	} else {
		var data = songs[idx];
		var song = {};

		var file = null;

		song.id = data.upload_id;
		isSongInDb(song.id, type, function(found) {
			console.log("Song with id "+song.id+" found in "+type+" "+found);
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
					parseData(type, songs, idx+1, callback);
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

	    		//song.isFavourite = ($.inArray(song.id, favourites) > -1);
					song.wasFavourite = false;
				  song.isPlaying = false;
				  song.isPlayed = false;

					song.isEdPick = song.tags.indexOf("editorial_pick") > -1;

					insertIntoDB(song, type, function() {
						parseData(type, songs, idx+1, callback);
					});
				}
			} else {
				parseData(type, songs, idx+1, callback);
			}
		});
	}
}

function toggleMedia() {
	console.log("toggleMedia");
	var page = wrapper[1].id;

	console.log("audio.readyState: "+audio.readyState);
	if (audio.readyState == 0)
	{
		console.log("Creating new audio element.");
		audio = new Audio();

		var songUrl = currentSong.downloadLink;
		songUrl = "https://ccmixter.christian-hufgard.de/"+songUrl.substr(songUrl.indexOf("/content")+1);

		audio.src = songUrl;

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
			if (!currentSong.isFavourite && playMode == "favourites") {
				console.log("Found discarded fav");
			} else {
			  insertIntoDB(currentSong, playMode);
      }

			if (playMode == "favourites") {
				if (randomPlay) {
					shuffle(playNextFav);
				} else {
					getPrevFavId(currentSong.id, true, playNextFav, function() {
						console.log("No new low fav found. Going back to the beginning...");
						getHighestId("favourites", playNextFav, function() {
							console.log("No highest fav found!");
							dialog("Seems you have no more favourites.");
						});
					});
				}
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

function playNextFav(song) {
	debug("next fav is ", song);
	audio.pause();
	audio.src = null;
	load(song, 1);
	toggleMedia();
}

function setupRandomSongs(count) {
	console.log("Calculating new random songs for "+count+" favs");
	randomSongs = [];
	for (i = 0; i < count; i++) {
		var next;
		do {
			next = Math.floor(Math.random()*count);
			var picked = false;
			for (j = 0; j < count; j++) {
				picked = picked || (randomSongs[j] == next);
			}
		} while (picked);
		randomSongs.push(next);
	}
	console.log(randomSongs);
}

function shuffle(success) {
	getCount('favourites', function(count) {
		console.log("Count is "+count);
		if (count === 0) {
			console.log("Fav count is zero");
			dialog("Seems you have no favourites chosen yet.");
		} else if (count == 1) {
			console.log("Fav count is one. Random makes no sense...");
			success(currentSong);
		} else {
			if (!randomSongs || randomSongs.length == 0) {
				setupRandomSongs(count);
			}
			var randomId = randomSongs.pop();
			console.log("Random is "+randomId);
			getShuffledSong('favourites', randomId, function(song) {
				if (song.id == currentSong.id) {
					 console.log("Found current song. Picking new one.");
					 shuffle(success);
				} else {
					debug("Shuffled song is ", song);
					isSongReadyToPlay(song, function()  {
							success(song);
						}, function() {
							console.log("Song not ready to play. Shuffelling again...");
							shuffle(success);
						}
					);
				}
			});
		}
	});
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

	isSongFavourite(currentSong.id, function(favourite) {
		console.log("Fav: "+favourite+" !show_former_favourites: "+!show_former_favourites+
			" (currentSong.isPlaying || currentSong.isPlayed)"+(currentSong.isPlaying || currentSong.isPlayed));
		if (!favourite && !show_former_favourites && (currentSong.isPlaying || currentSong.isPlayed)) {
			discardSong(downloadNewSongs);
		}
		if (callback) {
			callback();
		}
	});
}

function deleteSong(song, callback)
{
	debug("Deleting song ", song);
	var songUrl = song.downloadLink;
	songUrl = "https://ccmixter.christian-hufgard.de/"+songUrl.substr(songUrl.indexOf("/content")+1);
	console.log("url is: "+songUrl);
	if (callback) {
   	  caches.open("ccmixter2go")
		.then(cache => cache.delete(songUrl))
		.then(callback());
  } else {
   	  caches.open("ccmixter2go")
		.then(cache => cache.delete(songUrl));
  }
	//xxx
	return;
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
	}, function() {
		console.log("File not longer available. Maybe it was already deleted.");
		if (callback) {
			callback();
		}
	});
}

function playMedia() {
	currentSong.isPlaying = true;
	insertIntoDB(currentSong, playMode);
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
	var request = indexedDB.open('ccmixter2go', 4);

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
		try {
			store.createIndex("filename", "file_name", {unique: true});
		} catch (e)
		{
			console.log("remove me!");
		}

		if(!db.objectStoreNames.contains('favourites'))
		{
			store = db.createObjectStore('favourites', {
				keyPath: 'id'
			});
		}
		store = event.currentTarget.transaction.objectStore("favourites");
		try {
			store.createIndex("filename", "file_name", {unique: true});
		} catch (e)
		{
			console.log(e);
		}

		if(!db.objectStoreNames.contains('edPicks'))
		{
			store = db.createObjectStore('edPicks', {
				keyPath: 'id'
			});
		}
		store = event.currentTarget.transaction.objectStore("edPicks");
		try {
			store.createIndex("filename", "file_name", {unique: true});
		} catch (e)
		{
			console.log(e);
		}
	};

	request.onsuccess = function() {
		db = this.result;
  	console.log('Datenbank geöffnet');
		callback();
	};
}

$(document).ready(function() {
	$(".owl-carousel").owlCarousel({singleItem:true});
});

function setup() {
  if ('serviceWorker' in navigator) {
	   navigator.serviceWorker
	            .register('./service-worker.js')
	            .then(function() {
	               console.log('Service Worker Registered');
			});
			navigator.serviceWorker.ready.then(registration => {
				console.log("ServiceWorker is ready");
				$("#"+playMode).addClass("active");

				setupDB(function() {
					readFileCache(function() {
						setupOtherStuff();
					});
				});
			});
	}
	$.mobile.loading('show');
	storage_size = getIntFromLocalStorage("storage_size", 100);
	playMode = getStringFromLocalStorage("playMode", "edPicks");
	titleScroller();
}

function titleScroller() {
	var timeout = 500;
	if (newDocumentTitle) {
		timeout = 2000;
		newDocumentTitle = false;
	}

	if (currentSong && shiftedDocumentTitle.length <= currentSong.author.length) {
    timeout = 2000;
	}

  setTimeout(function () {
 		if (currentSong) {
			if (shiftedDocumentTitle.length <= currentSong.author.length) {
				shiftedDocumentTitle = documentTitle;
			} else {
			  shiftedDocumentTitle = shiftedDocumentTitle.substr(1);
			}
			document.title = shiftedDocumentTitle;
		}
		titleScroller();
	}, timeout);
};

function getDistanceForSong(song, wantedSong, success)
{
	getDistanceForSongById(song.id, wantedSong.id, success);
}

function getDistanceForSongById(song, wantedSong, success)
{
	console.log("Finding distance from "+wantedSong+" to "+song);
	var trans = db.transaction(playMode, 'readonly');
	var store = trans.objectStore(playMode);
	var range;
	var cursorRequest;
	if (song == wantedSong) {
		console.log("Distance to self is zero");
		success(0);
		return;
	}
	if (song > wantedSong) {
		console.log("Searching for prev songs");
		range = IDBKeyRange.upperBound(song-1);
		cursorRequest = store.openCursor(range, "prev");
	} else {
		console.log("Searching for next songs");
		range = IDBKeyRange.lowerBound(song+1);
		cursorRequest = store.openCursor(range, "next");
	}
	var distance = 0;
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var candidate = result.value;
			if (candidate.id == wantedSong) {
				debug("Distance is: "+distance, candidate);
				success(distance);
			} else {
				if (!candidate.isSkipped) {
					distance++;
				} else {
					console.log("Not counting skipped songs");
				}
				result.continue();
			}
		} else {
			dialog("Uh. That should not have happened. Never.", "Internal error");
		}
  };
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
					if (song.isFavourite || ((playMode == "edPicks") && song.isEdPick))
					{
						debug("Not deleting fav / edPick: ", song);
						deleteFileIfNotNeededInCache(entries, index+1, callback);
					} else {
						deleteSong(song, function() {
							deleteFileIfNotNeededInCache(entries, index+1, callback);
						});
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

function findCachedSongs(wantedSong, entries, index, cachedSongs, callback) {
	getActualSongDistance = function(song) {
		if (!song.isFavourite) {
			if (song.isSkipped) {
				debug("Song is skipped but was not deleted. Let's fix this.", song);
				deleteSong(song);
				findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
			} else {
				getSongById(song.id, playMode, function(playModeSong) {
					if (playModeSong) {
						getDistanceForSong(song, wantedSong, function(distance) {
							song.distance = distance;
							cachedSongs.push(song);
							findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
						});
					} else {
						console.log("Song not found in db "+playMode);
						song.distance = Number.MAX_VALUE;
						cachedSongs.push(song);
						findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
					}
				});
			}
		} else {
			console.log("Song is a favourites.");
			findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
		}
	};

	if (index < entries.length) {
		console.log("Checking entry at idx "+index);
		var entry = entries[index];
		if (!entry.isDirectory)
		{
			entry.file(function(file) {
				console.log(entry.name+" "+file.size);
				loadSongByFilename(entry.name, "songs", function(song) {
					if (song == null) {
						console.log("Song not found in songs. Must be an edPick or a fav.");
						loadSongByFilename(entry.name, "favourites", function(song) {
							if (song == null) {
								console.log("Song not found in favourites. Must be an edPick.");
								loadSongByFilename(entry.name, "edPicks", function(song) {
									if (song == null) {
										console.log("Uh. Song with name "+entry.name+" is totally unknown");
									} else {
										getActualSongDistance(song);
									}
								});
							} else {
								console.log("Song is a favourites.");
								findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
							}
						});
					} else {
						getActualSongDistance(song);
					};
				});
			});
		} else {
			findCachedSongs(wantedSong, entries, index+1, cachedSongs, callback);
		}
	} else {
		callback(cachedSongs);
	}
}

function getCachedSongs(callback) {
	getStoredFiles(function(entries) {
		findCachedSongs(currentSong, entries, 0, [], function(cachedSongs) {
			cachedSongs.sort(function (a,b) {
				return b.distance - a.distance;
			});
			for (i = 0; i < cachedSongs.length; i++) {
				debug("distance: "+cachedSongs[i].distance, cachedSongs[i]);
			}
			callback(cachedSongs);
		});
	});
}

function getFarestAwaySong(wantedSong, success) {
	getStoredFiles(function(entries) {
		findCachedSongs(wantedSong, entries, 0, [], function(cachedSongs) {
			if (cachedSongs.length > 1) {
				cachedSongs.sort(function (a,b) {
					return b.distance - a.distance;
				});
				console.log("[getFarestAwaySong]");
				console.log(cachedSongs[0]);
				success(cachedSongs[0]);
			} else {
				console.log("Only one song in cache found...");
				dialog("You should increase the cache size.", "Storage excceded!");
			}
		});
	});
}

function clearCache() {
	getStoredFiles(function(entries) {
		deleteFileIfNotNeededInCache(entries, 0, updateCacheState);
	});
}

function showCacheEntry(entries, idx) {
	if (idx < entries.length) {
		if (!entries[idx].isDirectory) {
			entries[idx].file(function(file) {
				loadSongByFilename(file.name, function(song) {
					debug("Cache entry: ", song);
					showCacheEntry(entries, idx + 1);
				});
			});
		} else {
			showCacheEntry(entries, idx + 1);
		}
	}
}

function showCache() {
	console.log("Cache:");
	getStoredFiles(function(entries) {
		showCacheEntry(entries, 0);
	});
}

function readFileCache(callback) {
	console.log("Reading cache...");
	getStoredFiles(function(entries) {
		sumFiles(entries, 0, 0, function(storage_used) {
			cacheSize = storage_used;
			updateCacheState();
			console.log("Cache read.");
			callback();
		});
	});
}

function updateCacheState() {
	console.log("cacheSize / storage_size: "+cacheSize+" / "+((Number(storage_size) * 1024 * 1024)));
	var percent = Number(cacheSize) * 100 / (Number(storage_size) * 1024 * 1024);
	if (percent > 100) {
		percent = 100;
	}
	console.log("Setting cache to "+percent);
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
			getHighestId("favourites", function(song) {
				checkIfFavsAreInPlaylist(loadedFavourites, song);
			}, function() {
				console.log("No favs found in db.");
			});
			loadFavData(loadedFavourites, 0);
		});
}

function setupPage() {
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

	var currentSongId = getIntFromLocalStorage("currentSongId", -1);
	if (currentSongId == -1) {
		console.log("No currentSongId found.");
		loadNewSongs(0, function() {
			console.log("New songs loaded. Getting highest id for "+playMode);
			getHighestId(playMode, function(song)
			{
				currentSong = song;
				if ((playMode == "edPicks") && (!song.isEdPick || song.isSkipped)) {
					if (song.isEdPick) {
						debug("Song was skipped", song);
					} else {
						debug("Song is no edpick", song);
					}
					getPrevSongId(song.id, "edPicks", loadSong, function() {
						console.log("No new edPick found. Maybe all are loaded?");
						dialog("Seems you have heard and discarded all edPicks at ccMixter. I cannot play anything.");
					});
				} else {
					if (song.isSkipped) {
						console.log("First song was skipped.");
						getPrevSongId(song.id, "songs", function(song) {
							debug("New first song: ", song);
							loadSong(song);
						}, function() {
								dialog("All songs heard. Get online and check if there are some more.");
						});
					} else {
						loadSong(song);
					}
				}
			});
		}, function() {
			console.log("No new songs found. Maybe all are loaded?");
			dialog("Seems you have heard and discarded all songs at ccMixter. I cannot play anything.");
		});
	} else {
		console.log("Loading currentSongId: "+currentSongId);
		getSongById(currentSongId, playMode, function(song) {
			if (song == null) {
				console.log("Song with id "+currentSongId+" not found in "+playMode);
				localStorage.removeItem("currentSongId");
				setupPage();
			} else {
				loadSong(song);
				console.log("playMode: "+playMode);
				if ((playMode == "songs") || (playMode == "edPicks")) {
					getHighestId(playMode, function(song) {
						var oldHighestId = song.id;
						loadNewSongs(0, function() {
							getHighestId(playMode, function(song) {
								console.log("song.id / oldHighestId: "+song.id+" / "+oldHighestId);
								if (song.id != oldHighestId) {
									dialog("New song found!", "Hooray!");
								} else {
									console.log("No new song in "+playMode+" found");
								}
							}, function() {
								dialog("Did you finish listening all songs meanwhile?");
							});
						});
					}, function() {
						dialog("Did you finish listening all songs meanwhile?");
					});
				} else if (playMode == "favourites") {
					randomPlay = true;
					shuffle(song => debug("Next song will be", song));
				} else {
					console.log("Searching for new songs only if in songs/edPicks mode. Mode is: "+playMode);
				}
			}
		});
	}
}

function showCredentialsDialog(callback) {
	if (user != null) {
		$('#user').val(user);
	}
	if (password != null) {
		$('#password').val(password);
	}

	$('#credentials_dialog').on({
		popupafterclose: function() {
			console.log(user+" / "+$('#user').val()+" / "+password+" / "+$('#password').val());
			if ((user == $('#user').val()) && (password == $('#password').val())) {
				console.log("Credentials not changed.");
				setupPage();
			}
		}
	});

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
	audio = new Audio();

	auto_download = getBooleanFromLocalStorage("auto_download", true);
	auto_download_wlan_only = getBooleanFromLocalStorage("auto_download_wlan_only", true);
	initialStart = getBooleanFromLocalStorage("initialStart", true);
	if (initialStart) {
		localStorage.setItem("initialStart", JSON.stringify(false));
		$('#wrapper1').css('display', 'none');
		$('#initial_dialog').popup();
		$('#initial_dialog').popup("open");
	}

	newestLoadedSong = getIntFromLocalStorage("newestLoadedSong", Number.MAX_VALUE);


	$("#storage_size").val(storage_size);
	$("#storage_size").attr("max", Number(storage_size)+100);
	$("#storage_size").slider("refresh");

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

	if (playMode == "edPicks") {
		console.log("edPicks_only enabled");
		$("#edPicks_only-switch").val("true");
		$("#edPicks_only-switch").slider("refresh");
	}

	user = getStringFromLocalStorage("user", null);
	password = getStringFromLocalStorage("password", null);

	if (online()) {
		if (user != null) {
			loginAndDownloadPlaylist();
		} else {
			console.log("No userdata found. Not downloading fav data from ccmixter");
			$.mobile.loading('hide');
		}
	} else {
		console.log("We are not online...");
		$.mobile.loading('hide');
	}
	setupPage();

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
//	$("#" + wrapper[1].id).hide();
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

	$("#edPicks").on("click", function(event, ui) {
		$("#edPicks").addClass("active");
		$("#favourites").removeClass("active");
		$("#songs").removeClass("active");
		playMode = "edPicks";
		localStorage.setItem("playMode", JSON.stringify(playMode));

		audio.pause();
		getHighestId(playMode, function(song) {
			console.log("Found highest id");
			currentSong = song;
			load(song, 1);
		}, function() {
			console.log("No highest id for an edpick found.");
			dialog("Seems you discarded all known edPicks.");
		});
	});

	$('.share').bind('click', function() {
		window.plugins.socialsharing.share('I am ready to share!');
	});

	$('#favourites').bind('click', function() {
		randomPlay = true;
		console.log("Enabling fav_autoplay. Shuffle: "+randomPlay);
		var oldPlayMode = playMode;
		playMode = "favourites";
		$("#favourites").addClass("active");
		$("#edPicks").removeClass("active");
		$("#songs").removeClass("active");

		localStorage.setItem("playMode", JSON.stringify(playMode));
		fav_download = autoDownloadEnabled();

		if (!currentSong.isFavourite) {
			startFavPlay = function(song) {
				audio.pause();
				audio.src = null;
				load(song, 1);
				toggleMedia();
				closeOptionsDialog();
			};

			startWithHigestFav = function() {
				getHighestId("favourites", startFavPlay);
			};
			if (randomPlay) {
				console.log("Resetting random songs");
				randomSongs = [];
				shuffle(startFavPlay);
			} else {
				if (autoDownloadEnabled()) {
					console.log("autoDownloadEnabled. Starting Fav Play");
					startWithHigestFav();
				} else {
					console.log("autoDownloadEnabled disabled. Looking for stored fav.");
					isAtLeastOneFavReadyToPlay(0, startWithHigestFav, function() {
						console.log("No favourites downloaded on device");
						playMode = oldPlayMode;
						localStorage.setItem("playMode", JSON.stringify(playMode));
						console.log("No favourites downloaded on device");
						dialog("No favourites downloaded on device", "Error", "#actions_dialog");
					});
				}
			}
		} else {
			console.log("Found a fav. No need to change that.");
			if (!audio.paused) {
				console.log("fav is playing. Keep that state.");
			} else {
				toggleMedia();
			}
			closeOptionsDialog();
		}
	});

	$('#show_former_favourites').bind('click', function() {
		console.log("Showing former favourites only");
		audio.pause();
		audio.src = null;
		playMode = "former_favs";
		localStorage.setItem("playMode", JSON.stringify(playMode));
		show_former_favourites = true;
		getPrevSongId(Number.MAX_VALUE, songs, function(song) {
			currentSong = song;
			load(song, 1);
			closeOptionsDialog();
		}, function() {
			console.log("No former favourite found.");
			dialog("No former favourite found.", "Error", "#actions_dialog");
		});
	});

	$('.wrapper').bind('swipeleft', function(event) {
		pauseCurrent();
		console.log("swipeleft");
		getNextSongId(currentSong.id, playMode, activateNextSong, function() {
			if (playMode == "favourites")
			{
				getNextSongId(-1, playMode, activateNextSong, function() {
					dialog("No more favourites available!");
				});
			} else if (playMode == "former_favs") {
				dialog('No more "deleted" favourites available!');
			} else {
				console.log("updating...");
				$.mobile.loading('show');
				loadNewSongs(0, function() {
					nextSong = getNextSongId(currentSong.id, playMode, function(song) {
						activateNextSong(song);
					}, function() {
						console.log("No newer song available.");
						dialog("No newer song available.");
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
    discardSong(swipeRight);
	});

	$('.wrapper').bind('swiperight', function(event) {
		swipeRight();
	});

	$('.wrapper').bind('swipeup', function(event) {
		swipeUp();
	});


	$('#options_dialog').on({
		popupafterclose: function() {
			var new_storage_size = $("#storage_size").val();
			if (new_storage_size != storage_size) {
				console.log("New storage size is: "+new_storage_size);
				storage_size = new_storage_size;
				localStorage.setItem("storage_size", JSON.stringify(new_storage_size));
				downloadNewSongs();
			}
		}
	});

	$('#songs').bind('click', function() {
		playMode = "songs";
		$("#songs").addClass("active");
		$("#edPicks").removeClass("active");
		$("#favourites").removeClass("active");

		localStorage.setItem("playMode", JSON.stringify(playMode));
		audio.pause();
		audio.src = null;
		progress('play', 0, 'black');
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

	$('.forward').bind('click', function() {
		pauseCurrent();
		if (playMode === "favourites") {
  		shuffle(playNextFav);
    } else {
			getHighestId(playMode, activateNextSong);
		}
	});

	$('.rewind').bind('click', function() {
		pauseCurrent();
		if (playMode === "favourites") {
			shuffle(playNextFav);
		} else {
			getLowestUnfavedId(playMode, null, activatePrevSong);
		}
	});

	$('.favourite').bind('click', function() {
		currentSong.isFavourite = !currentSong.isFavourite;
		currentSong.wasFavourite = !currentSong.isFavourite;
		console.log("fav toggeling");
		console.log(currentSong);
		if (!currentSong.isFavourite) {
			$('#' + wrapper[1].id + ' .favourite').removeClass('active');
			if (playMode == 'favourives') {
				let randomIdx = randomSongs.indexOf(currentSong.id);
				if (randomIdx > -1) {
					randomSongs.splice(randomIdx, 1);
				}
			}
		} else {
			$('#' + wrapper[1].id + ' .favourite').addClass('active');
			if (playMode == 'favourives') {
				randomSongs.push(currentSong.id);
			}
		}

		if (online()) {
	 	  if (playlistId > -1) {
				updatePlaylist(currentSong);
		  } else {
		  	console.log("ccmixter playlist not found");
		  }
		}
		if (currentSong.isFavourite) {
			insertIntoDB(currentSong, "favourites");

/*			var downloadPath = getStorageUrl(currentSong);
			resolveLocalFileSystemURL(downloadPath,
				function(entry) {
					console.log("Song found on device. Getting file size.");
					entry.file(function(file) {
						console.log("file.size: "+file.size);
						cacheSize -= file.size;
						updateCacheState();
					});
				});
				*/
		} else {
			deleteFromDB(currentSong, "favourites");
			deleteSong(currentSong);
		}

		updateFavouritesMenu(currentSong.isFavourite);
	});
}

function updatePlaylist(song, callback) {
	var url = baseUrl+"api/playlist/";
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
			dialog("Could not load playlist from ccMixter");
			callback();
		});
}

function checkIfFavsAreInPlaylist(loadedFavourites, song) {
	continueSearch = function() {
		getPrevFavId(song.id, false, function(song) {
				checkIfFavsAreInPlaylist(loadedFavourites, song);
			}, function() {
			console.log("All favs checked.");
		});
	};
	if (loadedFavourites.indexOf(song.id) == -1) {
		console.log("Fav with id "+song.id+" not stored in ccMixter playlist");
		updatePlaylist(song, continueSearch);
	} else {
		console.log("Fav with id "+song.id+" stored in ccMixter playlist");
		if (!song.isFavourite) {
			console.log("Song was not marked as fav.");
			insertIntoDB(song, "favourites");
		}
		continueSearch();
	}
}

function discardSong(callback) {
	debug("discardSong", currentSong);
		console.log("download_id == current "+download_id+" / "+current);
		if (playMode == "favourites")
		{
			deleteFromDB(currentSong, "favourites");
			deleteSong(currentSong, callback);
		} else {
			if (!currentSong.isFavourite) {
				console.log("Current song is no fav, so marking it as skipped");
				currentSong.isSkipped = true;
				deleteSong(currentSong, callback);
			} else {
				console.log("Current song is a fav, so not marking it as skipped");
			}
			insertIntoDB(currentSong, playMode);
		}
}

function taphold() {
	console.log("taphold");
	if (currentSong.isFavourite) {
  	$('#discard_favourite').popup("open");
	} else {
		$('#discard_dialog').popup("open");
	}
}

function swipeRight() {
	console.log("[swipeRight]");
	pauseCurrent(function() {
		getPrevSongId(currentSong.id, playMode, function(song)
		{
			activatePrevSong(song);
		}, function() {
			if (!(playMode == "favourites") && !(playMode == "former_favs")) {
					console.log("[swipeRight] updating...");
					$.mobile.loading('show');
					getCount(playMode == "edPicks" ? "edPicks" : "songs", function(count) {
						loadOldSongs(count, function(song) {
							activatePrevSong(song);
							downloadNewSongs();
						});
					});
			} else {
				getPrevSongId(Number.MAX_VALUE, playMode, function(song) {
					activatePrevSong(song);
				}, function() {
					console.log("[swipeRight] No more songs available");
					dialog("Seems you have heard and discarded all songs.");
				});
			}
		});
	});
}

function loadOldSongs(offset, callback) {
	console.log("[loadOldSongs] offset param: "+offset);
	getSongList(offset, function() {
		getPrevSongId(currentSong.id, playMode, function(song) {
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
	getSongList(0, callback, function() {
		//xxx
		console.log("No new songs found. Increasing offset.");
	  offset += resultSize;
	  console.log("offset set to:"+resultSize);
		loadNewSongs(offset, callback);
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
	console.log("playMode: "+playMode);

	if (candidate == null) {
	    return -1;
	}
	if (playMode == "all")
	{
		console.log("show all songs");
		return 1;
	} else if (playMode == "former_favs") {
		return candidate.wasFavourite ? 1 : 0;
	} else if (playMode == "edPicks") {
		console.log("checking for edPicks");
		if (candidate.isEdPick)
	 	{
			return candidate.isSkipped ? 0 : 1;
		} else {
			return 0;
		}
	} else if (playMode == "favourites")
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
		console.log("final check");
		return 1;
	} else {
		console.log("final check");
		return 0;
	}
}

function getSongId(startId, type, searchFunction, success, error)
{
	checkNextSong = function(startId) {
		searchFunction(startId, type, function(candidate) {
			if (checkSong(candidate) == 1)
			{
				debug("Found song", candidate);
				isSongFavourite(candidate.id, function (favourite) {
					candidate.isFavourite = favourite;
					success(candidate);
				});
				return;
			} else {
				debug("discarding ", candidate);
				checkNextSong(candidate.id);
			}
		}, error);
	};
	checkNextSong(startId);
}

function getNextSongId(startId, type, success, error)
{
	console.log("Searching for next song. playMode: "+playMode);
	getSongId(startId, type, loadSongWithIdHigherThan, success, error);
}

function getPrevSongId(startId, type, success, error)
{
	console.log("Searching for prev song. playMode: "+playMode);
	getSongId(startId, type, loadSongWithIdLowerThan, success, error);
}

function getPrevFavId(startId, skipUnreadySongs, success, error)
{
	console.log("Searching for prev fav starting at "+startId);
	getSongId(startId, "favourites", loadSongWithIdLowerThan, function(song) {
		isSongReadyToPlay(song, function() {
			console.log("Fav with id "+song.id+" is ready to play");
			success(song, true);
		}, function() {
			if (skipUnreadySongs) {
				console.log("We are looking for favs and song is not ready to play.");
				getPrevFavId(song.id, skipUnreadySongs, success, error);
			} else {
				success(song, false);
			}
		});
	}, error);
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

function loadSongByFilename(filename, type, callback) {
	console.log("Trying to load song for "+filename+" from "+type);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var index = store.index('filename');
	var request = index.get(filename);
	request.onerror = function(event) {
		console.log("File not found in db: "+filename);
		callback();
	};
	request.onsuccess = function(event) {
		var song = event.target.result;
		if (song == null) {
			console.log("Song for "+filename+" not found in "+type);
			callback();
		} else {
			isSongFavourite(song.id, function(favourite) {
				song.isFavourite = favourite;
				debug("Found song in "+type+" by filename:", song);
				callback(song);
			});
		}
	};
}

function getHighestId(type, success, error) {
	console.log("Trying to find highest id from "+type);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var range = IDBKeyRange.lowerBound(-1);
	var cursorRequest = store.openCursor(range, "prev");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			debug("Song with highest id is: ", song);
			isSongFavourite(song.id, function(favourite) {
				song.isFavourite = favourite;
				success(song);
			});
		} else {
			error();
		}
  };
}

function getLowestId(type, success, error) {
	console.log("Trying to find lowest id from "+type);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var range = IDBKeyRange.upperBound(Number.MAX_VALUE);
	var cursorRequest = store.openCursor(range, "next");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			debug("Song with lowest id is: ", song);
			isSongFavourite(song.id, function(favourite) {
				song.isFavourite = favourite;
				success(song);
			});
		} else {
			error();
		}
  };
}

function loadSongWithIdHigherThan(maxValue, type, success, error) {
	console.log("Trying to load song with id higher than "+maxValue+" from "+type);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var range = IDBKeyRange.lowerBound(maxValue+1);
	var cursorRequest = store.openCursor(range, "next");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			isSongFavourite(song.id, function(favourite) {
				song.isFavourite = favourite;
				success(song);
			});
		} else {
			console.log("Nothing found");
			error();
		}
  };
}

function getLowestUnfavedId(type, previousSong, success, error) {
	findLowestUnfavedId(type, previousSong, function(song) {
		if (song.isSkipped) {
			console.log("Song was skipped. Searching for unskipped previous song");
			getPrevSongId(song.id, type, success, error);
		} else {
			success(song);
		}
	}, error);
}

function findLowestUnfavedId(type, previousSong, success, error) {
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var start = 0;
	if (previousSong != null) {
		start = previousSong.id + 1;
	}
	console.log("Trying to get lowest unskipped song id from "+type+ "starting at "+start);
	var range = IDBKeyRange.lowerBound(start);
	var cursorRequest = store.openCursor(range, "next");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			isSongFavourite(song.id, function(favourite) {
				if (favourite) {
					success(previousSong);
				} else {
					findLowestUnfavedId(type, song, success, error);
				}
			});
		} else {
			console.log("Nothing found");
			error();
		}
  };
}


function loadSongWithIdLowerThan(minValue, type, success, error) {
	console.log("Trying to load song with id lower than "+minValue+" from "+type);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var range = IDBKeyRange.upperBound(minValue-1);
	var cursorRequest = store.openCursor(range, "prev");
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			var song = result.value;
			isSongFavourite(song.id, function(favourite) {
				song.isFavourite = favourite;
				if (favourite) {
					song.isSkipped = false; //workaround to fix earlier bug. can be removed for final release.
				}
				success(song);
			});
		} else {
			console.log("Nothing found");
			error();
		}
  };
}

function deleteFromDB(song, type) {
	debug("[deleteFromDB] "+type, song);
	var trans = db.transaction([type], 'readwrite');
	var store = trans.objectStore(type);
	store.delete(song.id);
}

function insertIntoDB(song, type, callback) {
	debug("[insertIntoDB] storing in "+type, song);
	var trans = db.transaction([type], 'readwrite');
	var store = trans.objectStore(type);
	store.put(song).onsuccess = function(event) {
		debug("[insertIntoDB] stored in "+type, song);
		if (callback) {
			callback();
		}
	};
}

function isSongFavourite(id, result)
{
	getSongById(id, "favourites", function(song) {
		if (song) {
			debug("Found song in favourites", song);
			result(true);
		} else {
			console.log("Did not find song with id "+id+" in favourites");
			result(false);
		}
	});
}

function isSongEdPick(id, result)
{
	getSongById(id, "edPicks", function(song) {
		if (song) {
			debug("Found song in edPicks", song);
			result(true);
		} else {
			console.log("Did not find song with id "+id+" in edPicks");
			result(false);
		}
	});
}

function getSongById(id, type, callback) {
	console.log("Loading song by id from "+type+": "+id);
	var trans = db.transaction([type], 'readonly');
	var store = trans.objectStore(type);
	var request = store.get(id);
	request.onerror = function(event) {
		console.log("isSongInDb error:");
		console.log(event);
	  callback(null);
	};
	request.onsuccess = function(event) {
		var song = event.target.result;
		if (song) {
			if (type == "favourites") {
				song.isFavourite = true;
				callback(song);
			} else {
				isSongFavourite(song.id, function(favourite) {
					song.isFavourite = favourite;
					callback(song);
				});
			}
		} else {
			callback(null);
		}
	};
}

function isSongInDb(id, type, callback) {
	console.log("Checking if song with id "+id+" is in db");
	getSongById(id, type, function(song) {
		callback(song != null);
	});
}

function getCount(type, callback)
{
	var countRequest = db.transaction(type, 'readonly').objectStore(type).
		count();
	countRequest.onsuccess = function()
		{
			var count = countRequest.result;
			console.log("[getCount] "+type+" count: "+count);
			console.log(countRequest);
		  callback(count);
		};
}

function getShuffledSong(type, idx, callback) {
	var trans = db.transaction(type, 'readonly');
	var store = trans.objectStore(type);
	var range = IDBKeyRange.lowerBound(0);
	console.log("Reading data from "+type+". Index is: "+idx);
	var cursorRequest = store.openCursor(range);
	var count = 0;
	var song;
	cursorRequest.onsuccess = function(evt) {
	  var result = evt.target.result;
		if (result) {
			song = result.value;
			debug("Song in iteration "+count+": ",song);
			if (count == idx) {
				callback(song);
			} else {
				count++;
				result.continue();
			}
		} else {
			console.log("Did not get a result anymore. Favs must have changed their number. Return last song.");
			callback(song);
		}
  };
}

function closeOptionsDialog() {
	$('#options_dialog').popup('close');
	$('#actions_dialog').popup('close');
}

function loginAtCcmixter(callback)
{
	$.ajax({ url: baseUrl+"login", cache: false, timeout: 30000, method: "POST",
		data: {user_name: user, user_password: password,
		form_submit: "Log In", http_referer: "http%3A%2F%2Fccmixter.org%2Flogout",
		userlogin: "classname"}})
		.done(function(data) {
			if (data.indexOf("var user_name =  null;") > -1) {
				console.log("Login failed!");
				showCredentialsDialog();
			} else {
				checkIfPlaylistExists(callback);
			}
		})
		.fail(function(xhr) {
			console.log(xhr);
			dialog("Could not login at ccMixter!");
		});
}

function checkIfPlaylistExists(callback) {
	console.log("Loading user's playlists from ccmixter...");
		$.ajax({ url: baseUrl+"api/queries?items=dataview%3Dplaylists%26limit%3D10%26user%3D"+user,
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
				}
				createPlaylist(callback);
			})
			.fail(function(xhr) {
				dialog("Could not load playlists from ccMixter");
				console.log(xhr);
			})
			.always(function() {
				$.mobile.loading('hide');
			});
}

function loadFavData(loadedFavourites, idx) {
	console.log("loadFavData");
	if (idx == loadedFavourites.length)
	{
		console.log("All favs checked");
	} else {
		getSongById(loadedFavourites[idx], "favourites", function(song) {
			if (song == null) {
				var url = baseUrl+"api/query?f=json&ids="+loadedFavourites[idx];
				console.log("Loading fav data from "+url);
				$.ajax({ url: url,
					cache: false, timeout: 30000, dataType: 'json'}).
					done(function(data) {
						console.log("Calling parseData for "+loadedFavourites[idx]);
						parseData("favourites", data, 0, function() {
							console.log("Loading song for "+loadedFavourites[idx]);
							getSongById(loadedFavourites[idx], "favourites", function(song) {
								if (song == null) {
									dialog("Song could not be stored!", "Internal error");
									return;
								}
								song.isFavourite = true;
								insertIntoDB(song, "favourites");
								if (idx < loadedFavourites.length)
								{
									loadFavData(loadedFavourites, idx+1);
								} else {
									callback(loadedFavourites);
								}
							});
						});
					}).
					fail(function(xhr) {
						console.log(xhr);
						dialog("Could not load favourites data from ccMixter.");
					}).
					always(function() {
					});
			} else {
				console.log("Fav with id "+song.id+" already known.");
				loadFavData(loadedFavourites, idx+1);
			}
		});
	}
}

function loadPlaylist(_playlistId, callback) {
	playlistId = _playlistId;
	console.log("Loading playlist with id "+playlistId+" from ccmixter...");
	$.ajax({ url: baseUrl+"api/query?f=jsex&playlist="+playlistId,
		cache: false, timeout: 30000, dataType: 'json'})
		.done(function(data) {
			console.log("Got playlist with id "+playlistId+" from ccmixter.");
			var loadedFavourites = [];
			$.each(data, function(key, song)
			{
				loadedFavourites.push(song.upload_id);
			});
			console.log(loadedFavourites);
			callback(loadedFavourites);
		})
		.fail(function(xhr) {
			console.log(xhr);
			dialog("Could not load playlist from ccMixter");
		})
		.always(function() {
		});
}

function createPlaylist(callback) {
	console.log("creating new playlist");
	$.ajax({ url: baseUrl+"api/playlist/new?cart_name=ccMixter2go", cache: false, timeout: 30000})
		.done(function(data) {
			checkIfPlaylistExists(function() {
				console.log("Playlist successfully created. Id is: "+playlistId);
				callback();
			});
		})
		.fail(function(xhr) {
			console.log(xhr);
			dialog("Could not create playlist at ccMixter.");
		})
		.always(function() {
			$.mobile.loading('hide');
		});
}

function isAtLeastOneFavReadyToPlay(idx, success, error) {
	if (idx < favourites.length) {
		getSongById(favourites[idx], "favourites", function(song) {
			console.log("Checking if fav with idx "+idx+" / id "+favourites[idx]+" is downloaded", song);
			isSongReadyToPlay(song, function() {
					debug("Fav is ready to play: ", song);
					success();
					return;
			}, function() {
				isAtLeastOneFavReadyToPlay(idx+1, success, error);
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
	$.mobile.loading('show');

  var finish = function(oldCount) {
		getCount(playMode == "edPicks" ? "edPicks" : "songs", function(count) {
			if ((oldCount == count) && error) {
				error();
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
		});
	};

	getCount(playMode == "edPicks" ? "edPicks" : "songs", function(count) {
		var url;
		if (playMode == "edPicks") {
			url = baseUrl+"api/query?f=json&limit="+limit+"&tags=remix,editorial_pick&offset="+offset;
		} else {
			url = baseUrl+"api/query?f=json&limit="+limit+"&tags=remix&offset="+offset;
		}
		console.log("Calling "+url);

		$.ajax({ url: url, cache: false, timeout: 30000, dataType: 'json'})
			.done(function(data) {
				console.log("Loaded "+playMode+" from offset "+offset+". Parsing...");
				parseData(playMode, data, 0, finish);
			})
			.fail(function(xhr) {
				console.log(xhr);
				dialog("Could not load check if new songs are avaiable at ccMixter.", "Communication error");
				finish(count);
			});
	});
}

function getStorageUrl(song)
{
	return song.file_name;
}

//just for dev
if (location.href.indexOf("/easy/www/index.html") > -1)
{
	$(document).ready(function() {
		//$('#credit_dialog').popup("open");
		//$('#help_button').load();
		setup();
	});
}

function debug(message, song) {
	console.log(message+" / "+song.id+" / "+song.author+" / "+song.title);
}

function dialog(message, title, currentDialog)
{
	if (!title) {
		title = "Attention please!";
	}
	$('#generic_header').html(title);
	$('#generic_content').html(message);
	if (currentDialog) {
		$.mobile.switchPopup(currentDialog, "#generic_dialog");
	} else {
		$('#generic_dialog').popup("open");
	}
}

$.mobile.switchPopup = function(sourceElement, destinationElement) {
	$(sourceElement).on("popupafterclose", function(){$(destinationElement).popup("open")}).popup("close");
};
