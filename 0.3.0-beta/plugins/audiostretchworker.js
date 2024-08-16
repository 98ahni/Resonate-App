//  This file is licenced under the GNU Affero General Public License and the Resonate Supplemental Terms. (See file LICENSE and LICENSE-SUPPLEMENT or <https://github.com/98ahni/Resonate>)
//  <Copyright (C) 2024 98ahni> Original file author

var Module = {};
const default_console_log = console.log;
const default_console_warn = console.warn;
const default_console_error = console.error;
(()=>{
    self.onerror = function (event, source, lineno, colno, error) {
        console.error("onerror: " + event.name + ": " + event.message + 
        "\n\t/bin/public/" + source.split('/').slice(-1) + ":" + lineno + ":" + colno);
        console.error(error.stack);
          //if(window.matchMedia('(any-pointer: coarse)').matches) // Enable if alert should be for touch only.
        alert("OnError: \n" + event.name + ": " + event.message);
    };
    fetch("/console", {
        method: "POST",
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({type: 'log', data: ['Log server open']})
    }).then(
    /*resolve*/(response)=>{
        if(response.status == 405){
            return;
        }
        console.log = (...data) => {
            fetch("/console", {
                method: "POST",
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({type: 'log', data})
            }).then(
            /*resolve*/()=>{}, 
            /*reject*/()=>{
                // No server, restore functions
                console.log = default_console_log;
                console.warn = default_console_warn;
                console.error = default_console_error;
            });
            default_console_log.apply(console, data);
        };
        console.warn = (...data) => {
            fetch("/console", {
                method: "POST",
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({type: 'warn', data})
            }).then(
            /*resolve*/()=>{}, 
            /*reject*/()=>{
                // No server, restore functions
                console.log = default_console_log;
                console.warn = default_console_warn;
                console.error = default_console_error;
            });
            default_console_warn.apply(console, data);
        };
        console.error = (...data) => {
            fetch("/console", {
                method: "POST",
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({type: 'error', data})
            }).then(
            /*resolve*/()=>{}, 
            /*reject*/()=>{
                // No server, restore functions
                console.log = default_console_log;
                console.warn = default_console_warn;
                console.error = default_console_error;
            });
            default_console_error.apply(console, data);
        };
    });
})();
//importScripts('timestretch.js', 'RubberBand.js', 'VexWarp/main.js', 'paulstretch.js');
importScripts('timestretch.js', 'VexWarp/main.js', 'paulstretch.js');

var worker_channelDataArray;
var worker_samples;
var worker_sampleRate;
var worker_isSafari;
var worker_engine;
onmessage = async function (msg)
{
    const msgFunction = msg.data[0];
    if(msgFunction === 'Setup'){
        worker_channelDataArray = msg.data[1];
        worker_samples = msg.data[2];
        worker_sampleRate = msg.data[3];
        worker_isSafari = msg.data[4];
    }
    else if(msgFunction === 'Work'){
        const engine = msg.data[1];
        worker_engine = engine;
        const stretchIndex = msg.data[2];
        const useCrude = msg.data[3];

        console.time('Audio stretch completed in');
        console.log('Stretching audio using ' + engine + ' engine...');
        if(engine === 'Legacy'){
            let outblob = null;
            console.log(worker_isSafari ? 'Browser is Safari' : 'Browser is not Safari');
            outblob = Module.audioDataArrayToBlob(Module.stretch(worker_channelDataArray, worker_samples, 1 / (stretchIndex * 0.1), (worker_isSafari ? worker_sampleRate : worker_sampleRate / 2)), worker_sampleRate);
            console.log('Streched blob nr ' + stretchIndex);
            postMessage([outblob, stretchIndex]);
        }
        else if(engine === 'RubberBand'){
            await new Promise((resolve) =>{
                Module['onRuntimeInitialized'] = ()=>{resolve();};
                importScripts('RubberBand.js');
            });
            global_audio_buffer = worker_channelDataArray;
            Module._jsRubberbandAudio(Emval.toHandle(worker_sampleRate), Emval.toHandle(worker_channelDataArray.length), Emval.toHandle(stretchIndex));
        }
        else if(engine === 'VexWarp'){
            const VexWarp = new Module.VexWarpStretch({
                vocode:false,
                stftBins:(
                    5 < stretchIndex ? 8192 :(
                    4 < stretchIndex ? 8192 :(
                    3 < stretchIndex ? 6144 :
                    5120))),
                stftHop:1 / (
                    5 < stretchIndex ? 3 :(
                    4 < stretchIndex ? 4.7 :(
                    3 < stretchIndex ? 4.8 :
                    6))),
                stretchFactor:1 / (stretchIndex * 0.1),
                sampleRate:worker_sampleRate});
            let output = [];
            for(let ch = 0; ch < worker_channelDataArray.length; ch++){
                VexWarp.setBuffer(worker_channelDataArray[ch], worker_sampleRate);
                VexWarp.stretch();
                output[ch] = VexWarp.getStretchedBuffer();
            }
            outblob = Module.audioDataArrayToBlob(output, worker_sampleRate);
            postMessage([outblob, stretchIndex]);
        }
        else if(engine === 'PaulStretch'){
            const bufferSize = 4096;
            const batchSize = 4 / 4096;
            const paulStretch = new PaulStretch(worker_channelDataArray.length, 1 / (stretchIndex * 0.1), bufferSize * batchSize);
            paulStretch.write(worker_channelDataArray);
            var outblocks = [];
            var output = [];
            for(var ch = 0; ch < worker_channelDataArray.length; ch++){
                outblocks.push(new Float32Array(bufferSize));
                output.push([]);
            }
            console.log('Stretching audio nr ' + stretchIndex);
            paulStretch.setRatio(1 / (stretchIndex * 0.1));
            while(paulStretch.writeQueueLength() !== 0){
                while ((paulStretch.readQueueLength() < (bufferSize)) 
                    && (paulStretch.process() !== 0)) { paulStretch.readQueueLength(); }
                if(paulStretch.read(outblocks) === null){ break; }
                for(var ch = 0; ch < worker_channelDataArray.length; ch++){
                    output[ch] = output[ch].concat(Array.from(outblocks[ch]));
                }
            }
            outblob = Module.audioDataArrayToBlob(output, worker_sampleRate);
            postMessage([outblob, stretchIndex]);
        }
        console.log('Audio stretching completed using ' + engine);
        console.timeEnd('Audio stretch completed in');
    }
    else if(msgFunction === 'Revive'){
        //postMessage(['data', worker_channelDataArray, worker_samples, worker_sampleRate, worker_isSafari]);
        postMessage([worker_engine]);
    }
}
