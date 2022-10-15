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

// const util = require('util');
const Homey = require('homey');
const Logger = require('./captureLogs');

// -----------------------app settings page backend-----------------------------
class settingsBackend extends Homey.App {

	onInit() {
		this.log('plugwise2py app is running!');
		if (!this.logger) this.logger = new Logger({ name: 'log', length: 200, homey: this.homey });

		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});
		process.on('uncaughtException', (error) => {
			this.error('uncaughtException! ', error);
		});
		this.homey
			.on('unload', () => {
				this.log('app unload called');
				// save logs to persistant storage
				this.logger.saveLogs();
			})
			.on('cpuwarn', () => {
				this.log('cpuwarn!');
			})
			.on('memwarn', () => {
				this.log('memwarn!');
			});
		// do garbage collection every 10 minutes
		// this.intervalIdGc = setInterval(() => {
		// 	global.gc();
		// }, 1000 * 60 * 10);
	}

	//  stuff for frontend API
	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}

	// check the MQTT settings from frontend
	// validateSettings(query) > was moved to driver

}

module.exports = settingsBackend;
