'use strict';

const Homey = require('homey');

class Circle extends Homey.Device {

	// this method is called when the Device is inited
	onInit() {
		this.log(`device init ${this.getClass()} ${this.getData().id} ${this.getName()}`);
		this._driver = this.getDriver();

		// register capability listener
		this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

		// start polling mqtt server for circle data and update the state
		this.intervalIdDevicePoll = setInterval(() => {
			try {
				if (this._driver.hasOwnProperty('mqttClient')) {
					if (! this._driver.mqttClient.connected) {
						return this.setUnavailable('No MQTT broker connection').catch(this.error)
					}
				}
				this._driver.checkCircleState(this.getData().id);
			} catch (error) { this.log('intervalIdDevicePoll error', error); }
		}, 1000 * this.getSetting('pollingInterval'));
	}

	// this method is called when the Device is added
	onAdded() {
		this.log(`circle added: ${this.getData().id} ${this.getName()}`);
	}

	// this method is called when the Device is deleted
	onDeleted() {
		this.log(`device deleted: ${this.getData().id} ${this.getName()}`);
	}

	// this method is called when the Device has requested a state change (turned on or off)
	onCapabilityOnoff(value, opts) {
		this.log(`on/off requested: ${value} ${JSON.stringify(opts)}`);
		this._driver.switchCircleOnoff(this.getData().id, value);
		return Promise.resolve(true);
		// return Promise.reject(new Error('Switching the device failed!'));
	}

	// this method is called when the user has changed the device's settings in Homey.
	onSettings(newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
		// first stop polling the device, then start init after short delay
		clearInterval(this.intervalIdDevicePoll);
		this.log('circle device settings changed');
		this.setAvailable()
			.catch(this.error);
		setTimeout(() => {
			this.onInit();
		}, 10000);
		callback(null, true);
	}

	updateCircleEnergy(circleEnergy) {
		if (this.getCapabilityValue('meter_power') !== Math.abs(circleEnergy.cum_energy / 1000)) {
			this.setCapabilityValue('meter_power', Math.abs(circleEnergy.cum_energy / 1000))
				.catch(this.error);
		}
	}

	updateCircleState(circleState) {
		if (this.getCapabilityValue('onoff') !== (circleState.switch === 'on')) {
			this.setCapabilityValue('onoff', circleState.switch === 'on')
				.catch(this.error);
		}
		if (this.getCapabilityValue('measure_power') !== Math.round(circleState.power8s * 10) / 10) {
			this.setCapabilityValue('measure_power', Math.round(circleState.power8s * 10) / 10)
				.catch(this.error);
		}

		// report available or unavailable
		if (circleState.online === false) {
			this.setUnavailable('Device not online')
				.catch(this.error);
		} else { this.setAvailable().catch(this.error);	}

		// update the info presented in the device settings
		const settings = this.getSettings();
		let type = 'unknown';
		if (circleState.type === 1) { type = 'Circle Plus'; }
		if (circleState.type === 2) { type = 'Circle'; }
		const newSettings = {
			mac: circleState.mac,
			pollingInterval: settings.pollingInterval,
			type,
			lastseen: `${new Date(circleState.lastseen * 1000).toLocaleString().split(':')[0]}:xx`,
			production: circleState.production.toString(),
			pwName: circleState.name,
			location: circleState.location,
			switchable: (!circleState.readonly).toString(),
			schedule: circleState.schedule.toString(),
			schedname: circleState.schedname,
			name: settings.name,
		};
		Object.keys(settings).forEach((key) => {
			if ((settings[key] !== newSettings[key]) && newSettings[key] !== undefined) {
				// this.log(`device information has changed. ${key}: ${newSettings[key]}`);
				this.setSettings({ [key]: newSettings[key] })
					.catch(this.error);
			}
		});
	}
}

module.exports = Circle;

// Just for information:
/*
circleState: {
	mac: e.g. '000D6F000037A836'  //mac of circle in pw2py
	type: 2 (circle) or 1 (circle+)
	name: e.g. 'çar'   // name of circle in pw2py
	location: e.g. '1st floor' // location of circle in pw2py
	online: true or false
	lastseen: e.g. 1475524537  // timestamp when circle was last seen by circle+ or by pw2py?
	monitor: true or false // Autonomous messages are published when monitoring = true and savelog = true
	savelog: true or false // Autonomous messages are published when monitoring = true and savelog = true
	interval: e.g. 60  // circle buffer power measure integration interval in minutes?
	readonly: true or false
	schedule: 'on' or 'off'
	schedname: e.g. 'sched. 1' // name of schedule to use
	switch: 'on' or 'off'
	switchreq: 'on' or 'off'
	requid: e.g. 'internal' // dunno what this is... MQTT clientId maybe?
	reverse_pol: true or false   // reverses the sign if true
	production: true or false
	powerts: e.g. 1475524537 // timestamp of power measurement?
	power1s: e.g. 0     //1s power measure (W)
	power8s: e.g. 0     //8s power measure (W)
	power1h: e.g. 0     //1h power measure (Wh)
},
circleEnergy: {
	typ: 'pwenergy'
	ts: e.g. 1474194240  // timestamp when energy was read
	mac: e.g. '000D6F000037A836'  // mac of circle in pw2py
	power: e.g. 185.6051 // dunno what this is... 8s power measure maybe?
	energy: e.g. 6.1868  // energy (wH) over last interval?
	cum_energy: e.g. 521930.4033  // energy (wH) since start of reading by pw2py?
	interval: e.g. 60  // circle buffer power measure integration interval in minutes?
}
*/
