// Models for aiorussound

export class Zone  {
  constructor({
    name = null,
    volume = "0",
    bass = "0",
    treble = "0",
    balance = "0",
    loudness = "OFF",
    turnOnVolume = "20",
    doNotDisturb = "OFF",
    partyMode = "OFF",
    status = "OFF",
    mute = "OFF",
    sharedSource = "OFF",
    lastError = null,
    page = null,
    sleepTimeDefault = null,
    sleepTimeRemaining = null,
    enabled = "False",
    currentSource = "1"
  } = {}) {
    this.name = name;
    this.volume = volume;
    this.bass = bass;
    this.treble = treble;
    this.balance = balance;
    this.loudness = loudness;
    this.turnOnVolume = turnOnVolume;
    this.doNotDisturb = doNotDisturb;
    this.partyMode = partyMode;
    this.status = status;
    this.mute = mute;
    this.sharedSource = sharedSource;
    this.lastError = lastError;
    this.page = page;
    this.sleepTimeDefault = sleepTimeDefault;
    this.sleepTimeRemaining = sleepTimeRemaining;
    this.enabled = enabled;
    this.currentSource = currentSource;
  }
}

export class Source  {
  constructor({
    name = null,
    type = null,
    channel = null,
    coverArtURL = null,
    channelName = null,
    genre = null,
    artistName = null,
    albumName = null,
    playlistName = null,
    songName = null,
    programServiceName = null,
    radioText = null,
    shuffleMode = null,
    repeatMode = null,
    mode = null,
    playStatus = null,
    sampleRate = null,
    bitRate = null,
    bitDepth = null,
    playTime = null,
    trackTime = null
  } = {}) {
    this.name = name;
    this.type = type;
    this.channel = channel;
    this.coverArtURL = coverArtURL;
    this.channelName = channelName;
    this.genre = genre;
    this.artistName = artistName;
    this.albumName = albumName;
    this.playlistName = playlistName;
    this.songName = songName;
    this.programServiceName = programServiceName;
    this.radioText = radioText;
    this.shuffleMode = shuffleMode;
    this.repeatMode = repeatMode;
    this.mode = mode;
    this.playStatus = playStatus;
    this.sampleRate = sampleRate;
    this.bitRate = bitRate;
    this.bitDepth = bitDepth;
    this.playTime = playTime;
    this.trackTime = trackTime;
  }
}

export const CallbackType = {
  STATE: "state",
  CONNECTION: "connection"
};

export const MessageType = {
  STATE: "S",
  NOTIFICATION: "N",
  ERROR: "E"
};

export class RussoundMessage {
  constructor(type, branch = null, leaf = null, value = null) {
    this.type = type;
    this.branch = branch;
    this.leaf = leaf;
    this.value = value;
  }
}