'use strict';

// const util = require('util');
const Homey = require('homey');

// -----------------------app settings page backend-----------------------------
class settingsBackend extends Homey.App {

	onInit() {
		this.log('app init started');
		// this._driver = Homey.ManagerDrivers.getDriver('circle');

		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});

		Homey
			.on('unload', () => {
				this.log('app unload called');
			})
			.on('memwarn', () => {
				this.log('memwarn!');
				// pause polling for a minutes and reset connection
				const driver = Homey.ManagerDrivers.getDriver('circle');
				if (driver.mqttClient !== undefined) {
					this.log('ending previous mqtt client session');
					driver.mqttClient.end();
				}
				setTimeout(() => {
					driver.onInit();
				}, 60000);
			});
	}

	// check the settings for frontend via api
	validateSettings(settings) {
		return new Promise((resolve, reject) => {
			this.log(settings);
			Homey.ManagerDrivers.getDriver('circle').validateSettings(settings)
				.then((result) => {	resolve(result);	})
				.catch((error) => {	reject(error);	});
		});
	}

}

module.exports = settingsBackend;
