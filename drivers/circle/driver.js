/*
Copyright 2016 - 2023, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.plugwise2py.

com.gruijter.plugwise2py is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.plugwise2py is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.gruijter.plugwise2py.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const { Driver } = require('homey');
const mqtt = require('mqtt');
const util = require('util');

const setTimeoutPromise = util.promisify(setTimeout);

// this driver handles the mqtt broker communication and keeps a list of all
// circles and states (including non-paired)
class Pw2pyDriver extends Driver {

	async onInit() {
		try {
			this.log('Pw2pyDriver onInit');
			// init some variables
			this.allCirclesState = {};		// latest state of all pw2py devices
			this.allCirclesEnergy = {};		// latest energy state of all pw2py devices
			this.mqttSettings = this.homey.settings.get('settings');
			this.homey.app.validateSettings = this.validateSettings; // validate mqtt settings from frontend
			// init listeners
			if (!this.allListeners) await this.registerListeners();
			// connect to mqtt host
			await this.connectHost();
		} catch (error) {
			this.error(error.message);
			await setTimeoutPromise(60 * 1000);
			this.onInit();
		}
	}

	async registerListeners() {
		try {
			this.log('registering listeners');
			if (!this.allListeners) this.allListeners = {};
			this.homey.settings.on('set', (changedKey) => {	// Fired when an app setting has changed
				if (changedKey === 'settings') {		// save button is pressed, reconnect must be initiated
					this.log(changedKey);
					this.mqttSettings = this.homey.settings.get('settings');
					this.onInit();
				}
			});
			return Promise.resolve(this.listeners);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async connectHost() {
		this.mqttSettings = this.homey.settings.get('settings');
		if ((this.mqttSettings === null) || (this.mqttSettings === undefined)) {
			throw Error('There are no app settings');
		}
		if (this.mqttClient !== undefined) {
			this.log('ending previous mqtt client session');
			this.mqttClient.end();
		}
		const protocol = this.mqttSettings.tls_mqtt ? 'mqtts' : 'mqtt';
		const host = `${protocol}://${this.mqttSettings.ip_mqtt}:${this.mqttSettings.port_mqtt}`;
		const options =	{
			clientId: `Homey_${Math.random().toString(16).substring(2, 8)}`,
			username: this.mqttSettings.username_mqtt,
			password: this.mqttSettings.password_mqtt,
			// protocolId: 'MQTT',
			rejectUnauthorized: false,
			keepalive: 60,
			reconnectPeriod: 10000,
			clean: true,
			queueQoSZero: false,
		};
		this.mqttClient = mqtt.connect(host, options);
		this.mqttClient
			.on('error', (error) => { this.error(error); })
			.on('offline', () => { this.log('mqtt broker is offline'); })
			.on('reconnect', () => { this.log('client is trying to reconnect'); })
			.on('close', () => { this.log('client closed (disconnected)');	})
			.on('end', () => { this.log('client ended');	})
			.on('connect', (connack) => {
				this.log(`mqtt connection ok: ${JSON.stringify(connack)}`);
				// this.log('subscribing to plugwise2py/state/circle/# and plugwise2py/state/energy/#');
				this.mqttClient.subscribe(
					['plugwise2py/state/circle/#', 'plugwise2py/state/energy/#'],
					{},
					(err, granted) => {
						if (err) this.error(`mqtt subscription error: ${err}`);
						else this.log(`mqtt subscription ok: ${JSON.stringify(granted)}`);
					},
				);
			})
			.on('message', (topic, message) => {		// handle incoming messages
				// this.log(`message received from topic: ${topic}`);
				if (message.length > 0) {	// won't crash but question is why empty?
					let circleState;
					let circleEnergy;
					switch (topic.substring(0, 25)) {
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

	async onPairListDevices() {
		this.log('listing of devices started');
		return this.makeDeviceList(this.allCirclesState);
	}

	checkCircleState(circleId) {
		const cmd = {
			mac: '',
			cmd: 'reqstate',
			val: '1',
		};
		this.mqttClient.publish(
			`plugwise2py/cmd/reqstate/${circleId}`,	// topic
			JSON.stringify(cmd),	// message
			// {},	// options
			// (err) => {	// callback
			// 	if (err) this.error(`checkCircleState publish error: ${err}`);
			// },
		);
	//    Homey.log('polling state of: '+circleId);
	}

	switchCircleOnoff(circleId, onoff) {
		const cmd = {
			mac: '',
			cmd: 'switch',
			val: 'off',
		};
		if (onoff) { cmd.val = 'on'; }
		this.log(`switching ${cmd.val}: ${circleId} ${this.allCirclesState[circleId].name}`);
		this.mqttClient.publish(
			`plugwise2py/cmd/switch/${circleId}`,	// topic
			JSON.stringify(cmd), // message
			{},	// options
			(err) => {	// callback
				if (err) this.error(`switchCircleOnOff publish error: ${err}`);
			},
		);
	}

	tryGetDevice(id) {
		try {
			const device = this.getDevice({ id });
			return device;
		} catch (error) {
			return null; // this is not a paired circle
		}
	}

	async handleNewCircleState(circleState) {
		try {
			this.allCirclesState[circleState.mac] = circleState;	// update allCirclesState
			const device = this.tryGetDevice(circleState.mac);
			if (device && typeof device.updateCircleState === 'function') await device.updateCircleState(circleState);
		} catch (error) {
			this.error(error);
		}
	}

	async handleNewEnergyState(circleEnergy) {
		this.allCirclesEnergy[circleEnergy.mac] = circleEnergy;	// update allCirclesState
		try {
			const device = this.tryGetDevice(circleEnergy.mac);
			if (device && typeof device.updateCircleEnergy === 'function') await device.updateCircleEnergy(circleEnergy);
		} catch (error) {
			this.error(error);
		}
	}

	// make pairing list of all circels posted by pw2py
	makeDeviceList(circles) {
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
		return deviceList;
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

	// validate mqtt settings from frontend
	validateSettings(settings) {
		return new Promise((resolve, reject) => {
			try {
				const protocol = settings.tls_mqtt ? 'mqtts' : 'mqtt';
				const host = `${protocol}://${settings.ip_mqtt}:${settings.port_mqtt}`;
				const options =	{
					clientId: `Homey_${Math.random().toString(16).substring(2, 8)}`,
					username: settings.username_mqtt,
					password: settings.password_mqtt,
					// protocolId: 'MQTT',
					rejectUnauthorized: false,
					// keepalive: 60,
					// reconnectPeriod: 10000,
					// clean: true,
					// queueQoSZero: false,
				};
				const testClient = mqtt.connect(host, options);
				testClient
					.on('connect', () => {
						this.log(`client is connected? : ${testClient.connected}`);
						testClient.end();
						// client is connected, settings are correct!
						resolve(true);
					})
					.on('offline', () => {
						this.log('broker offline');
						testClient.end();
						reject(Error('incorrect ip address or port?'));
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
						reject(error);
					});
				setTimeout(() => {
					testClient.end();
					reject(Error('Timeout'));
				}, 10000);
			} catch (error) {
				this.error('error while validating settings: ', error);
				reject(error);
			}
		});
	}

}

module.exports = Pw2pyDriver;
