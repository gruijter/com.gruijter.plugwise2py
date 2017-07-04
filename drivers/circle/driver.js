'use strict';

const util = require('util');
const mqtt = require('mqtt');
let client = mqtt.connect();                   // MQTT client object
let host;
let options;
const allCirclesState = {};     // latest state of all pw2py devices
const allCirclesEnergy = {};    // latest energy state of all pw2py devices
const devices = {};             // paired Homey devices copy in memory
const intervalId = {};          // polling intervalId
const intervalIdSaveSettings = {}; // intervalId for saving circle device settings


// ----------------------Initializing devices-----------------------------
// the `init` method is called when your driver is loaded after start or reboot
module.exports.init = function Init(devicesData, callback) {
	connectMqtt();
	devicesData.forEach((deviceData) => {
		initDevice(deviceData);
	});
	callback();
};

// function to prevent 'Unexpected token' errors
function tryParseJSON(jsonString) {
	try {
		const o = JSON.parse(jsonString);
		if (o && typeof o === 'object' && o !== null) {
			// Homey.log('JSON past')
			return o;
		}
		Homey.log('Not a valid JSON');
	}	catch (e) {
		Homey.log('Not a valid JSON');
	}
	return false;
}

// -----------Plugwise2py MQTT broker communication----------------
// Homey.log(util.inspect(client));

function connectMqtt() {
  // connect to mqtt broker
	client.end();
	const storedData = Homey.manager('settings').get('settings');
	// Homey.log('got data: ', storedData);
	if (storedData !== (null || undefined)) {
		host = `mqtt://${storedData.ip_mqtt}:${storedData.port_mqtt}`;
		options =
		{
			// port: storedData.port_mqtt,
			clientId: 'Homey', // _${Math.random().toString(16).substr(2, 8)}`,
			username: storedData.username_mqtt,
			password: storedData.password_mqtt,
		};
		client = new mqtt.connect(host, options);
	}

  // subscribe to plugwise2py MQTT broker - circle state
	client.on('connect', (connack) => {
		Homey.log(connack);
		client.subscribe('plugwise2py/state/circle/#');
		Homey.log('subscribing to plugwise2py/state/circle/#');
		client.subscribe('plugwise2py/state/energy/#');
		Homey.log('subscribing to plugwise2py/state/energy/#');
	});

  // handle incoming messages
	client.on('message', (topic, message) => {
    // message is Buffer
		// Homey.log(`message received from topic: ${topic}`);
		// Homey.log(tryParseJSON(message.toString()));
		if (message.length > 0) {               // won't crash but question is why empty?
			let circleState;
			let circleEnergy;
			switch (topic.substr(0, 25)) {
				case 'plugwise2py/state/circle/':
					circleState = tryParseJSON(message.toString());
					handleNewCircleState(circleState);
					break;
				case 'plugwise2py/state/energy/':
					circleEnergy = tryParseJSON(message.toString());
					handleNewEnergyState(circleEnergy);
					break;
				default:
					break;
			}
		}
	});

}

function checkCircleState(deviceData) {
	client.publish(`plugwise2py/cmd/reqstate/${deviceData.id}`, JSON.stringify({ mac: '', cmd: 'reqstate', val: '1' }));
//    Homey.log('polling state of: '+deviceData.id);
}

function switchCircleOnoff(deviceData, onoff, callback) {
	if (onoff) {
		client.publish(`plugwise2py/cmd/switch/${deviceData.id}`, JSON.stringify({ mac: '', cmd: 'switch', val: 'on' }));
		Homey.log(`switching on: ${deviceData.id}${allCirclesState[deviceData.id].name}`);
	} else {
		client.publish(`plugwise2py/cmd/switch/${deviceData.id}`, JSON.stringify({ mac: '', cmd: 'switch', val: 'off' }));
		Homey.log(`switching off: ${deviceData.id}${allCirclesState[deviceData.id].name}`);
	}
	callback();
}

// ----------------------Pairing and deleting-------------------------------

// the `pair` method is called when a user start pairing
module.exports.pair = function pair(socket) {
	socket.on('list_devices', (data, callback) => {
		Homey.log('listing of devices started');
		makeDeviceList(allCirclesState, (deviceList) => {
			Homey.log(deviceList);
			callback(null, deviceList);
		});
	});
	socket.on('disconnect', () => {
		Homey.log('User aborted pairing, or pairing is finished');
	});
};

// the `added` method is called is when pairing is done and a device has been added
module.exports.added = function added(deviceData, callback) {
	Homey.log(`Device has been added: ${util.inspect(deviceData)}`);
	initDevice(deviceData);
	callback(null, true);
};

// the `delete` method is called when a device has been deleted by a user
module.exports.deleted = function deleted(deviceData, callback) {
	Homey.log(`Deleting ${deviceData.id}`);
	clearInterval(intervalId[deviceData.id]); // end polling of device for readings
	clearInterval(intervalIdSaveSettings[deviceData.id]); // end saving settings every hour
	setTimeout(() => {         // wait for running poll to end
		delete devices[deviceData.id];
	}, 12000);
	callback(null, true);
};

// make pairing list of all circels posted by pw2py
function makeDeviceList(circles, callback) {
	Homey.log('entered makeDeviceList');
	const deviceList = []; // all pw2py devices list used during pairing
	let circle;
	for (circle in circles) {
	//		Homey.log(circle);
		if (circles.hasOwnProperty(circle)) {
			const tmpDevice = {
				name: circles[circle].name,
				data: { id: circles[circle].mac	},
				settings: { name: circles[circle].name },       // pw2py name of device as found during pairing
				capabilities: ['onoff', 'measure_power', 'meter_power'],
			};
			deviceList.push(tmpDevice);
		}
	}
//  Homey.log(deviceList);
	callback(deviceList);
}


// -------------Settings and Capabilities handling------------------------------

// Fired when an app setting has changed
Homey.manager('settings').on('set', (changedKey) => {
	// Homey.log(changedKey);
	if (changedKey === 'settings') {		// save button is pressed, reconnect must be initiated
		Homey.log('Settings save button is pressed, reconnect is started');
		connectMqtt();
	}
});

// the `renamed` method is called when the user has renamed the device in Homey
module.exports.renamed = function renamed(deviceData, newName) {
	devices[deviceData.id].name = newName;
};

// the `settings` method is called when the user has changed the device settings in Homey
module.exports.settings = function settings(deviceData, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
  // see settings
	callback(null, true); 	// always fire the callback, or the settings won't change!
};

function updateSettings(deviceData) {
	const device = devices[deviceData.id];
	// Homey.log('updating device settings');
	// Homey.log(util.inspect(device));
	if (device.circleState === undefined) { return; }
	const settingsData = {
		mac: device.circleState.mac,        // mac of circle in pw2py // allCirclesState[deviceData.id].mac
		type: device.circleState.type.toString(),                // 2 (circle) or 1 (circle+)
		production: device.circleState.production.toString(),    // true or false // allCirclesState[deviceData.id].production
		pwName: device.circleState.name,                         // name of circle in pw2py // allCirclesState[deviceData.id].name
		location: device.circleState.location,                   // location of circle in pw2py // allCirclesState[deviceData.id].location
		lastseen: new Date(device.circleState.lastseen * 1000).toString(), // timestamp when circle was last seen by circle+ maybe? or by pw2py?
		switchable: (!device.circleState.readonly).toString(),             // true or false // allCirclesState[deviceData.id].readonly
		schedule: device.circleState.schedule.toString(),       // 'on' or 'off' // allCirclesState[deviceData.id].schedule
		schedname: device.circleState.schedname,      					// name of schedule to use // allCirclesState[deviceData.id].schedname
	};
	module.exports.setSettings(device.homey_device, settingsData, (err, sett) => {
		// Homey.log(err);
		// Homey.log(sett);
		// ... dunno what to do here, think nothing...
	});
}

module.exports.capabilities = {
	onoff: {
		get: (deviceData, callback) => {
			if (devices[deviceData.id] !== undefined) {
				const state = (devices[deviceData.id].circleState.swtch === 'on');
				return callback(null, state);
			}
			callback();
		},
		set: (deviceData, onoff, callback) => {
			if (devices[deviceData.id] !== undefined) {
				switchCircleOnoff(devices[deviceData.id], onoff, () => {
				// reserved for callback
				});
				return callback(null, devices[deviceData.id].circleState.swtch === 'on');
			}
			callback();
		},
	},
	measure_power: {
		get: (deviceData, callback) => {
			if (devices[deviceData.id] !== undefined) {
				if (devices[deviceData.id].circleState.power8s !== null) {
					const state = devices[deviceData.id].circleState.power8s;
					return callback(null, state);
				}
			}
			callback();
		},
	},
	meter_power: {
		get: (deviceData, callback) => {
			if (devices[deviceData.id] !== undefined) {
				if (devices[deviceData.id].circleEnergy.cum_energy !== null) {
					const state = devices[deviceData.id].circleEnergy.cum_energy / 1000;
					return callback(null, state);
				}
			}
			callback();
		},
	},
};

// ----initDevice: retrieve device settings, buildDevice and start polling it----
function initDevice(deviceData) {
	Homey.log('entering initDevice');
	module.exports.getSettings(deviceData, (err, settings) => {
		if (err) {
			Homey.log('error retrieving device settings');
		} else {    // after settings received build the new device object
			Homey.log('retrieved settings are:');
			Homey.log(settings);
			buildDevice(deviceData, settings);
			startPolling(deviceData);
			setTimeout(() => {         // update settings after 15 seconds wait
				updateSettings(devices[deviceData.id]);
			}, 15000);
		}
	});
}

// ------------build device during init and add to Homey devicelist--------------
function buildDevice(deviceData, settings) {
	devices[deviceData.id] = {
		id: deviceData.id,    // is equal to the circle mac
		name: settings.name,  // name of the Homey device
		pollingInterval: settings.pollingInterval || 20,
		homey_device: deviceData, // deviceData object from moment of pairing
		circleState: {       // or deviceData.pairingState   // circleState from moment of pairing
			mac: settings.mac, // e.g. '000D6F000037A836'  //mac of circle in pw2py // allCirclesState[deviceData.id].mac
			type: settings.type,   // 2 (circle) or 1 (circle+)
			name: settings.pwName, // e.g. 'çar'   // name of circle in pw2py // allCirclesState[deviceData.id].name
			location: settings.location,  // e.g. '1st floor' // location of circle in pw2py
			online: null,      // true or false // dunno exactly what makes the condition true
			lastseen: settings.lastseen,  // e.g. 1475524537  // timestamp when circle was last seen by circle+ or by pw2py?
			monitor: null,     // true or false // Autonomous messages are published when monitoring = true and savelog = true
			savelog: null,     // true or false // Autonomous messages are published when monitoring = true and savelog = true
			interval: null,    // e.g. 60  // circle buffer power measure integration interval in minutes?
			readonly: null,    // true or false  // allCirclesState[deviceData.id].readonly
			schedule: settings.schedule,  	// 'on' or 'off'  // allCirclesState[deviceData.id].schedule
			schedname: settings.schedname,  // e.g. 'sched. 1' // name of schedule to use
			switch: 'off',		   // 'on' or 'off'  // allCirclesState[deviceData.id].swtch
			switchreq: null,   // 'on' or 'off'  // dunno what this is...
			requid: null,      // e.g. 'internal' // dunno what this is... MQTT clientId maybe?
			reverse_pol: null, // true or false   // reverses the sign if true
			production: settings.production,  // true or false   // allCirclesState[deviceData.id].production
			powerts: null,     // e.g. 1475524537 // timestamp of power measurement?
			power1s: null,     // e.g. 0     //1s power measure (W) // allCirclesState[deviceData.id].power1s
			power8s: null,     // e.g. 0     //8s power measure (W) // allCirclesState[deviceData.id].power8s
			power1h: null,     // e.g. 0     //1h power measure (Wh) // allCirclesState[deviceData.id].power1h
		},
		circleEnergy: {    // or deviceData.pairingEnergy    // circleEnergy from moment of pairing
			typ: null,       // 'pwenergy'
			ts: null,        // e.g. 1474194240          // timestamp when energy was read
			mac: null,       // e.g. '000D6F000037A836'  // mac of circle in pw2py
			power: null,     // e.g. 185.6051            // dunno what this is... 8s power measure maybe?
			energy: null,    // e.g. 6.1868              // energy (wH) over last interval?
			cum_energy: null,  // e.g. 521930.4033       // energy (wH) since start of reading by pw2py?
			interval: null,  // e.g. 60                  // circle buffer power measure integration interval in minutes?
		},
	};
	Homey.log('init buildDevice is: ');
	Homey.log(devices[deviceData.id]);
}

// -------------stop and start polling device for readings every x seconds--------------
function startPolling(deviceData) {
	intervalId[deviceData.id] = setInterval(() => {
		if (client === undefined) {
			connectMqtt();
		}	else {
			if (!client.connected) {
				module.exports.setUnavailable(deviceData, 'MQTT broker not connected');
				connectMqtt();
			} else {
				checkCircleState(deviceData);
			}
		}
	}, 1000 * devices[deviceData.id].pollingInterval); // default poll every 20 seconds
	intervalIdSaveSettings[deviceData.id] = setInterval(() => {
		Homey.log('saving device settings');
		updateSettings(deviceData);
	}, 1000 * 60 * 60); // save every hour
}

// -------------------Update deviceData in memory and log for insights-----------------
function handleNewCircleState(circleState) {
	allCirclesState[circleState.mac] = circleState;    // update allCirclesState
	// Homey.log(circleState);
	if (devices[circleState.mac] !== undefined) {        // update only paired and initialised devices
		devices[circleState.mac].circleState = circleState;
		module.exports.realtime(devices[circleState.mac].homey_device, 'measure_power', circleState.power8s);
		module.exports.realtime(devices[circleState.mac].homey_device, 'onoff', circleState.switch === 'on');
		if (circleState.online === true) {
			module.exports.setAvailable(devices[circleState.mac].homey_device);
		} else {
			module.exports.setUnavailable(devices[circleState.mac].homey_device, 'Offline');
		}
	}
}

function handleNewEnergyState(circleEnergy) {
	if (devices[circleEnergy.mac] !== undefined) {        // update only paired and initialised devices
		devices[circleEnergy.mac].circleEnergy = circleEnergy;
		if (devices[circleEnergy.mac].circleState.production === true) {
			circleEnergy.cum_energy = -circleEnergy.cum_energy;
		}
		module.exports.realtime(devices[circleEnergy.mac].homey_device, 'meter_power', circleEnergy.cum_energy / 1000);
		allCirclesEnergy[circleEnergy.mac] = circleEnergy;    // update allCirclesState
	}
}
