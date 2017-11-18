'use strict';

const Homey = require('homey');
const mqtt = require('mqtt');
// const util = require('util');

// this driver handles the mqtt broker communication and keeps a list of all
// circles and states (including non-paired)
class Pw2pyDriver extends Homey.Driver {

	onInit() {
		this.log('Pw2pyDriver onInit');

		// init some variables
		this.allCirclesState = {};		// latest state of all pw2py devices
		this.allCirclesEnergy = {};		// latest energy state of all pw2py devices
		this.mqttSettings = Homey.ManagerSettings.get('settings');

		this.connectHost()	// connect to mqtt host
			.then(() => {
				this.subscribeState();	// subscribe to plugwise2py MQTT broker - circle state
			})
			.catch((error) => {
				this.error(error);
			});

		// Fired when an app setting has changed
		Homey.ManagerSettings.on('set', (changedKey) => {
			if (changedKey === 'settings') {		// save button is pressed, reconnect must be initiated
				this.log(changedKey);
				this.onInit();
			}
		});
	}

	connectHost() {
		return new Promise((resolve, reject) => {
			try {
				if ((this.mqttSettings === null) || (this.mqttSettings === undefined)) { return reject('there are no settings'); }
				if (this.mqttClient !== undefined) {
					this.log('ending previous mqtt client session');
					this.mqttClient.end();
				}
				const host = `mqtt://${this.mqttSettings.ip_mqtt}:${this.mqttSettings.port_mqtt}`;
				const options =
					{
						port: this.mqttSettings.port_mqtt,
						clientId: `Homey_${Math.random().toString(16).substr(2, 8)}`,
						username: this.mqttSettings.username_mqtt,
						password: this.mqttSettings.password_mqtt,
						reconnectPeriod: 10000,
					};
				this.mqttClient = mqtt.connect(host, options);
				this.mqttClient
					.on('error', (error) => { this.log(error); })
					.on('offline', () => { this.log('mqtt broker is offline'); })
					.on('reconnect', () => { this.log('client is trying to reconnect'); })
					.on('close', () => { this.log('client closed');	});
				return resolve(true);
			} catch (error) {
				this.log('error during connectHost');
				return reject(error);
			}
		});
	}

	subscribeState() {
		this.mqttClient
			.on('connect', (connack) => {
				this.log('mqtt connection successfull ', connack);
				this.mqttClient.subscribe('plugwise2py/state/circle/#');
				this.log('subscribing to plugwise2py/state/circle/#');
				this.mqttClient.subscribe('plugwise2py/state/energy/#');
				this.log('subscribing to plugwise2py/state/energy/#');
			})
			.on('message', (topic, message) => {		// handle incoming messages
				// this.log(`message received from topic: ${topic}`);
				if (message.length > 0) {	// won't crash but question is why empty?
					let circleState;
					let circleEnergy;
					switch (topic.substr(0, 25)) {
						case 'plugwise2py/state/circle/':
							circleState = this.tryParseJSON(message.toString());
							this.handleNewCircleState(circleState);
							break;
						case 'plugwise2py/state/energy/':
							circleEnergy = this.tryParseJSON(message.toString());
							this.handleNewEnergyState(circleEnergy);
							break;
						default:
							break;
					}
				}
			});
	}

	onPairListDevices(data, callback) {
		this.log('listing of devices started');
		this.makeDeviceList(this.allCirclesState)
			.then((deviceList) => {
				callback(null, deviceList);
			})
			.catch((error) => {
				callback(error);
			});
	}

	checkCircleState(circleId) {
		this.mqttClient.publish(`plugwise2py/cmd/reqstate/${circleId}`, JSON.stringify({ mac: '', cmd: 'reqstate', val: '1' }));
	//    Homey.log('polling state of: '+circleId);
	}
	switchCircleOnoff(circleId, onoff) {
		if (onoff) {
			this.mqttClient.publish(`plugwise2py/cmd/switch/${circleId}`, JSON.stringify({ mac: '', cmd: 'switch', val: 'on' }));
			this.log(`switching on: ${circleId} ${this.allCirclesState[circleId].name}`);
		} else {
			this.mqttClient.publish(`plugwise2py/cmd/switch/${circleId}`, JSON.stringify({ mac: '', cmd: 'switch', val: 'off' }));
			this.log(`switching off: ${circleId} ${this.allCirclesState[circleId].name}`);
		}
	}

	handleNewCircleState(circleState) {
		// this.log(circleState.mac);
		this.allCirclesState[circleState.mac] = circleState;	// update allCirclesState
		try {
			const device = this.getDevice({ id: circleState.mac });
			if (Object.prototype.hasOwnProperty.call(device, '__ready')) {
				device.updateCircleState(circleState);
			}
		} catch (error) {
			this.log(error);
		}
	}

	handleNewEnergyState(circleEnergy) {
		this.allCirclesEnergy[circleEnergy.mac] = circleEnergy;	// update allCirclesState
		try {
			const device = this.getDevice({ id: circleEnergy.mac });
			if (Object.prototype.hasOwnProperty.call(device, '__ready')) {
				// this.log(circleEnergy);
				device.updateCircleEnergy(circleEnergy);
			}
		} catch (error) {
			this.log(error);
		}
	}

	// make pairing list of all circels posted by pw2py
	makeDeviceList(circles) {
		return new Promise((resolve, reject) => {
			try {
				this.log('entered makeDeviceList');
				this.log(circles);
				const deviceList = [];	// make an empty list
				Object.keys(circles).forEach((circle) => {
					const tmpDevice = {
						name: circles[circle].name,
						data: { id: circles[circle].mac	},
						settings: { name: circles[circle].name },	// pw2py name of device
						capabilities: ['onoff', 'measure_power', 'meter_power'],
					};
					deviceList.push(tmpDevice);
				});
				return resolve(deviceList);
			} catch (error) {
				this.log('error while making deviceList', error);
				return reject(error);
			}
		});
	}

	// function to prevent 'Unexpected token' errors
	tryParseJSON(jsonString) {
		try {
			const o = JSON.parse(jsonString);
			if (o && typeof o === 'object' && o !== null) {
				return o;
			}
			this.log('Not a valid JSON');
		}	catch (e) {
			this.log('Not a valid JSON');
		}
		return false;
	}

	validateSettings(settings) {
		return new Promise((resolve, reject) => {
			try {
				const testHost = `mqtt://${settings.ip_mqtt}:${settings.port_mqtt}`;
				const testOptions =
					{
						port: settings.port_mqtt,
						clientId: `Homey_${Math.random().toString(16).substr(2, 8)}`,
						username: settings.username_mqtt,
						password: settings.password_mqtt,
						// connectTimeout: 20 * 1000,
						// keepalive: 0,
					};
				const testClient = mqtt.connect(testHost, testOptions);
				testClient
					.on('connect', () => {
						this.log(`client is connected? : ${testClient.connected}`);
						testClient.end();
						// client is connected, settings are correct!
						return resolve(true);
					})
					.on('offline', () => {
						this.log('broker offline');
						testClient.end();
						return reject(Error('incorrect ip address or port?'));
					})
					// when offline the MQTT module will automatically try to reconnect
					// .on('reconnect', () => {
					// 	this.log('reconnect started');
					// })
					// if reconnect fails, the connection is closed and reconnect will start again
					// .on('close', () => {
					// 	this.log('client closed');
					// })
					.on('error', (error) => {
						this.log(error);
						this.log('connection with broker not successful');
						testClient.end();
						// send result back to settings html
						return reject(error);
					});
				return setTimeout(() => {
					reject(Error('Timeout'));
				}, 10000);
			} catch (error) {
				this.error('error while validating settings: ', error);
				return reject(error);
			}
		});
	}

}

module.exports = Pw2pyDriver;
