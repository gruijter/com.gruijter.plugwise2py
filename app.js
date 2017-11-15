'use strict';

// const util = require('util');
const Homey = require('homey');

// -----------------------app settings page backend-----------------------------
class settingsBackend extends Homey.App {

	onInit() {
		this.log('app init started');
		this._driver = Homey.ManagerDrivers.getDriver('circle');

		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});
		Homey.on('unload', () => {
			this.log('app unload called');
		});
	}

	// check the settings for frontend via api
	validateSettings(settings) {
		return new Promise((resolve, reject) => {
			this.log(settings);
			this._driver.validateSettings(settings)
				.then((result) => {	resolve(result);	})
				.catch((error) => {	reject(error);	});
		});
	}

}

module.exports = settingsBackend;
