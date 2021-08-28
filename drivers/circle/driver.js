/*
Copyright 2016 - 2021, Robin de Gruijter (gruijter@hotmail.com)

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

const Homey = require('homey');
const mqtt = require('mqtt');
// const util = require('util');

// this driver handles the mqtt broker communication and keeps a list of all
// circles and states (including non-paired)
class Pw2pyDriver extends Homey.Driver {

	onInit() {
		if (this.initBusy) {
			this.log('Pw2pyDriver onInit already busy');
			return;
		}
		this.log('Pw2pyDriver onInit');
		// init some variables
		this.initBusy = true;
		this.allCirclesState = {};		// latest state of all pw2py devices
		this.allCirclesEnergy = {};		// latest energy state of all pw2py devices
		this.mqttSettings = Homey.ManagerSettings.get('settings');
		Homey.ManagerSettings.on('set', (changedKey) => {	// Fired when an app setting has changed
			if (changedKey === 'settings') {		// save button is pressed, reconnect must be initiated
				this.log(changedKey);
				this.onInit();
			}
		});
		this.connectHost()	// connect to mqtt host
			.then(() => {
				this.initBusy = false;
			})
			.catch((error) => {
				this.error(error.message);
				this.initBusy = false;
			});
	}

	connectHost() {
		return new Promise((resolve, reject) => {
			try {
				if ((this.mqttSettings === null) || (this.mqttSettings === undefined)) { return reject(Error('There are no app settings')); }
				if (this.mqttClient !== undefined) {
					this.log('ending previous mqtt client session');
					this.mqttClient.end();
				}
				const protocol = this.mqttSettings.tls_mqtt ? 'mqtts' : 'mqtt';
				const host = `${protocol}://${this.mqttSettings.ip_mqtt}:${this.mqttSettings.port_mqtt}`;
				const options =	{
					clientId: `Homey_${Math.random().toString(16).substr(2, 8)}`,
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
				return resolve(true);
			} catch (error) {
				this.error('error during connectHost');
				return reject(error);
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

	handleNewCircleState(circleState) {
		this.allCirclesState[circleState.mac] = circleState;	// update allCirclesState
		try {
			const device = this.getDevice({ id: circleState.mac });
			if (device instanceof Homey.Device) {
				device.updateCircleState(circleState);
			}
		} catch (error) {
			this.error(error);
		}
	}

	handleNewEnergyState(circleEnergy) {
		this.allCirclesEnergy[circleEnergy.mac] = circleEnergy;	// update allCirclesState
		try {
			const device = this.getDevice({ id: circleEnergy.mac });
			if (device instanceof Homey.Device) {
				device.updateCircleEnergy(circleEnergy);
			}
		} catch (error) {
			this.error(error);
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
				const protocol = settings.tls_mqtt ? 'mqtts' : 'mqtt';
				const host = `${protocol}://${settings.ip_mqtt}:${settings.port_mqtt}`;
				const options =	{
					clientId: `Homey_${Math.random().toString(16).substr(2, 8)}`,
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
					testClient.end();
				}, 10000);
			} catch (error) {
				this.error('error while validating settings: ', error);
				return reject(error);
			}
		});
	}

}

module.exports = Pw2pyDriver;
