(function () {

'use strict'

/**
 * Copy `len` bytes generated by a function to `array` starting at `pos`
 */
function copy (len, array, pos, fn) {
  for (var i = 0; i < len; i++) {
    if(pos + i < array.length){
      array[pos + i] = fn(i);
    }
    else {
      array.push(fn(i));
    }
  }
}

// from https://github.com/danigb/timestretch/blob/master/lib/index.js
function stretch (channelDataArray, samples, scale, sampleRate) {
  // OPTIONS
  //var opts = options || {};
  // Processing sequence size (100 msec with 44100Hz sample rate)
  //var seqSize = opts.seqSize || 4410;
  var seqSize = sampleRate / 10;
  // Overlapping size (20 msec)
  //var overlap = opts.overlap || 0;
  var overlap = 0;
  // Best overlap offset seeking window (15 msec)
  // var seekWindow = opts.seekWindow || 662

  // The theoretical start of the next sequence
  var nextOffset = seqSize / scale;

  // Setup the buffers
  var numSamples = samples;
  var output = [];

  for(var ch = 0; ch < channelDataArray.length; ch++){
    var inL = channelDataArray[ch];
    var outL = [0];
    //outL.fill(null);
    //outL.length = Math.round(numSamples * scale);
    
    // STATE
    // where to read then next sequence
    var read = 0;
    // where to write the next sequence
    var write = 0;
    // where to read the next fadeout
    var readOverlap = 0;
    
    while (numSamples - read > seqSize) {
      // write the first overlap
      copy(overlap, outL, Math.round(write), function (i) {
        var fadeIn = i / overlap;
        var fadeOut = 1 - fadeIn;
        // Mix the begin of the new sequence with the tail of the sequence last
        return (inL[read + i] * fadeIn + inL[readOverlap + i] * fadeOut) / 2;
      });
      copy(seqSize - overlap, outL, Math.round(write + overlap), function (i) {
        // Copy the tail of the sequence
        return inL[read + overlap + i];
      });
      // the next overlap is after this sequence
      readOverlap += read + seqSize;
      // the next sequence is after the nextOffset
      read = Math.round(read + nextOffset);
      // we wrote a complete sequence
      write += seqSize;
    }
    //channelDataArray[ch] = [];      // Memory management
    output.push(outL);
  }
  return output
}

// from https://stackoverflow.com/questions/62172398/convert-audiobuffer-to-arraybuffer-blob-for-wav-download
// Returns Uint8Array of WAV bytes
function getWavBytes(buffer, options) {
  const type = options.isFloat ? Float32Array : Uint16Array;
  const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT;

  const headerBytes = getWavHeader(Object.assign({}, options, { numFrames }));
  const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

  // prepend header, then add pcmBytes
  wavBytes.set(headerBytes, 0);
  wavBytes.set(new Uint8Array(buffer), headerBytes.length);

  return wavBytes;
}

// adapted from https://gist.github.com/also/900023
// returns Uint8Array of WAV header bytes
function getWavHeader(options) {
  const numFrames =      options.numFrames;
  const numChannels =    options.numChannels || 2;
  const sampleRate =     options.sampleRate || 44100;
  const bytesPerSample = options.isFloat? 4 : 2;
  const format =         options.isFloat? 3 : 1;

  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44);
  const dv = new DataView(buffer);

  let p = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) {
      dv.setUint8(p + i, s.charCodeAt(i));
    }
    p += s.length;
  }

  function writeUint32(d) {
    dv.setUint32(p, d, true);
    p += 4;
  }

  function writeUint16(d) {
    dv.setUint16(p, d, true);
    p += 2;
  }

  writeString('RIFF');              // ChunkID
  writeUint32(dataSize + 36);       // ChunkSize
  writeString('WAVE');              // Format
  writeString('fmt ');              // Subchunk1ID
  writeUint32(16);                  // Subchunk1Size
  writeUint16(format);              // AudioFormat https://i.stack.imgur.com/BuSmb.png
  writeUint16(numChannels);         // NumChannels
  writeUint32(sampleRate);          // SampleRate
  writeUint32(byteRate);            // ByteRate
  writeUint16(blockAlign);          // BlockAlign
  writeUint16(bytesPerSample * 8);  // BitsPerSample
  writeString('data');              // Subchunk2ID
  writeUint32(dataSize);            // Subchunk2Size

  return new Uint8Array(buffer);
}

function audioBufferToBlob(audioBuffer, sampleRate) {
  const isSterio = audioBuffer.numberOfChannels >= 2;
  const [left, right] =  [audioBuffer.getChannelData(0), (isSterio ? audioBuffer.getChannelData(1) : null)];

  // interleaved
  const interleaved = new Float32Array(left.length + (isSterio ? right.length : left.length));
  for (let src=0, dst=0; src < left.length; src++, dst+=2) {
    interleaved[dst] =   left[src];
    interleaved[dst+1] = (isSterio ? right[src] : left[src]);
  }

  // get WAV file bytes and audio params of your audio source
  const wavBytes = getWavBytes(interleaved.buffer, {
    isFloat: true, // floating point or 16-bit integer
    numChannels: 2,
    sampleRate: sampleRate,
  });
  const wav = new Blob([wavBytes], { type: "audio/wav" });
  return wav;
}
function audioDataArrayToBlob(audioDataArray, sampleRate) {
  const isSterio = audioDataArray.length >= 2;
  const [left, right] =  [audioDataArray[0], (isSterio ? audioDataArray[1] : null)];

  // interleaved
  const interleaved = new Float32Array(left.length + (isSterio ? right.length : left.length));
  for (let src=0, dst=0; src < left.length; src++, dst+=2) {
    interleaved[dst] =   left[src];
    interleaved[dst+1] = (isSterio ? right[src] : left[src]);
  }

  //audioDataArray = [];      // Memory management
  //left = undefined;      // Memory management
  //right = undefined;      // Memory management

  // get WAV file bytes and audio params of your audio source
  const wavBytes = getWavBytes(interleaved.buffer, {
    isFloat: true, // floating point or 16-bit integer
    numChannels: 2,
    sampleRate: sampleRate,
  });
  //interleaved = undefined;      // Memory management
  const wav = new Blob([wavBytes], { type: "audio/wav" });
  return wav;
}

Module['stretch'] = stretch;
Module['audioBufferToBlob'] = audioBufferToBlob;
Module['audioDataArrayToBlob'] = audioDataArrayToBlob;

})();